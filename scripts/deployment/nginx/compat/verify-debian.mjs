// Isolated executable/module compatibility check. Does not install/reload host Nginx.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer, request } from 'node:https'
import { createServer as tcpServer } from 'node:net'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, unlinkSync, chmodSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { render } from '../render.mjs'

const shared = createRequire(import.meta.url)('../../../../packages/auth-network/index.cjs')
const [packageDirectory, output] = process.argv.slice(2).map(value => resolve(value))
if (!packageDirectory || !output || process.argv.length !== 4) throw Error('Usage: node verify-debian.mjs <authenticated-package-directory> <new-output-directory>')
if (existsSync(output)) throw Error('NEW_OUTPUT_DIRECTORY_REQUIRED')
mkdirSync(output, { recursive: true, mode: 0o700 })
const receipts = [], cases = [], children = new Set()
const binary = join(packageDirectory, 'root/usr/sbin/nginx'), njs = join(packageDirectory, 'root/usr/bin/njs')
const moduleFile = join(packageDirectory, 'root/usr/lib/nginx/modules/ngx_http_js_module.so')
const key = randomBytes(32).toString('hex'), nonces = new Set()
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const flush = () => writeFileSync(join(output, 'process-exits.json'), JSON.stringify(receipts, null, 2) + '\n')
function start(stage, file, args, env = process.env) {
  const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.add(child)
  let stdout = '', stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  const completed = new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      children.delete(child)
      const record = { stage, code, signal, stdout, stderr }
      receipts.push(record); flush(); resolveExit(record)
    })
  })
  return { child, completed }
}
async function run(stage, file, args, env) {
  const r = await start(stage, file, args, env).completed
  assert.equal(r.code, 0, stage + ': ' + r.stderr)
  assert.equal(r.signal, null, stage)
  return r
}
async function port() {
  const s = tcpServer(); await new Promise(r => s.listen(0, '127.0.0.1', r))
  const p = s.address().port; await new Promise(r => s.close(r)); return p
}
const cert = join(output, 'cert.pem'), privateKey = join(output, 'key.pem')
let relay, nginx
const bodyList = [Buffer.alloc(0), Buffer.from('{"email":"مشتری@example.test"}'), Buffer.from([0, 255, 192, 175, 13, 10, 128]), Buffer.alloc(1200000, 255)]
const paths = ['/api/didar/login?q=%2f&x=+', '/api/didar/register', '/didar/login', '/didar/register?z=1&z=2']
const vectors = { positive: [], invalidPeers: ['', '01.2.3.4', '256.1.2.3', 'fe80::1%eth0', '1::2::3'] }
for (const peer of ['127.0.0.1', '2001:db8::1', '::ffff:192.0.2.9']) for (const body of bodyList.slice(0, 3)) for (const path of paths) {
  const input = { key: 'test-only-key-0123456789abcdef0123456789', peer, method: 'POST', path, body, ts: 1770000000000, nonce: '1234567890abcdef1234567890abcdef' }
  vectors.positive.push({ input: { ...input, body: undefined, bodyHex: body.toString('hex') }, expected: shared.signNetwork(input) })
}
async function send(frontPort, path, body, source = '127.0.0.1', headers = {}, method = 'POST') {
  return new Promise((done, reject) => {
    const req = request({ hostname: '127.0.0.1', servername: 'localhost', localAddress: source, port: frontPort, ca: readFileSync(cert), path, method,
      headers: { 'Content-Length': body.length, ...headers } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => done({ status: response.statusCode, body: Buffer.concat(chunks).toString() }))
    })
    req.on('error', reject); req.end(body)
  })
}
async function launch(frontPort, relayPort, mode) {
  const dir = join(output, mode); mkdirSync(dir, { mode: 0o700 })
  render({ NJS_MODULE_FILE: moduleFile, PID_FILE: join(dir, 'nginx.pid'), SIGNER_DIRECTORY: output, RELAY_ADDRESS: '127.0.0.1:' + relayPort,
    LISTEN_ADDRESS: '127.0.0.1:' + frontPort, PUBLIC_HOST: 'localhost', PUBLIC_PORT: String(frontPort), TLS_CERT_FILE: cert, TLS_KEY_FILE: privateKey,
    UPSTREAM_CA_FILE: cert, RELAY_TLS_NAME: 'localhost' }, dir)
  const configPath = join(dir, 'nginx.conf')
  let config = readFileSync(configPath, 'utf8').replace('error_log /dev/stderr warn;', `error_log ${dir}/error.log warn;`).replace('http {', `http {\n client_body_temp_path ${dir}/body; proxy_temp_path ${dir}/proxy; fastcgi_temp_path ${dir}/fastcgi; uwsgi_temp_path ${dir}/uwsgi; scgi_temp_path ${dir}/scgi;`)
  if (mode === 'rewritten-peer') config = config.replace('server_name localhost;', 'server_name localhost;\n set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP;')
  writeFileSync(configPath, config)
  await run('nginx-config-' + mode, binary, ['-p', dir + '/', '-c', configPath, '-t'])
  const env = { ...process.env, DIDAR_AUTH_NETWORK_KEY: mode === 'missing-key' ? '' : key }
  const handle = start('nginx-' + mode, binary, ['-p', dir + '/', '-c', configPath, '-g', 'daemon off;'], env)
  nginx = handle
  for (let i = 0; i < 100; i++) {
    try { await send(frontPort, '/ready', Buffer.alloc(0), '127.0.0.1', {}, 'GET'); return }
    catch { if (handle.child.exitCode !== null) throw Error('NGINX_EARLY_EXIT'); await new Promise(r => setTimeout(r, 25)) }
  }
  throw Error('NGINX_NOT_READY')
}
async function stop() {
  if (!nginx) return
  nginx.child.kill('SIGQUIT')
  const result = await nginx.completed; nginx = undefined
  assert.equal(result.code, 0, 'graceful nginx shutdown'); assert.equal(result.signal, null)
}
try {
  await run('nginx-version', binary, ['-V'])
  await run('njs-version', njs, ['-v'])
  await run('module-dependencies', 'ldd', [moduleFile])
  for (const f of ['sign.mjs', 'auth.mjs', 'njs-vectors.mjs']) copyFileSync(new URL('../' + f, import.meta.url), join(output, f))
  writeFileSync(join(output, 'vectors.json'), JSON.stringify(vectors))
  await run('njs-exact-v1-vectors', njs, ['-m', join(output, 'njs-vectors.mjs')], { ...process.env, DIDAR_NJS_VECTORS: join(output, 'vectors.json') })
  await run('test-certificate', 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', privateKey, '-out', cert])
  chmodSync(privateKey, 0o600)
  relay = createServer({ key: readFileSync(privateKey), cert: readFileSync(cert) }, (req, res) => {
    const buffers = []; req.on('data', chunk => buffers.push(chunk)); req.on('end', () => {
      const raw = Buffer.concat(buffers)
      if (req.url === '/ready') { res.end('ready'); return }
      try {
        const proof = shared.verifyNetwork({ key, assertion: req.headers['x-didar-auth-network'], method: req.method, path: req.url, body: raw })
        assert(!nonces.has(proof.nonce)); nonces.add(proof.nonce)
        assert.equal(req.headers['x-forwarded-for'], undefined); assert.equal(req.headers['x-real-ip'], undefined)
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ peer: proof.peer, rawHash: createHash('sha256').update(raw).digest('hex'), path: req.url }))
      } catch { res.statusCode = 403; res.end('FORBIDDEN') }
    })
  })
  await new Promise(r => relay.listen(0, '127.0.0.1', r))
  const relayPort = relay.address().port, frontPort = await port()
  await launch(frontPort, relayPort, 'supported')
  for (const source of ['127.0.0.1', '127.0.0.2']) for (const path of paths) for (const raw of bodyList) {
    const response = await send(frontPort, path, raw, source, { 'X-Forwarded-For': '198.51.100.123', 'X-Real-IP': '203.0.113.8', 'X-Didar-Auth-Network': 'spoof' })
    assert.equal(response.status, 200, response.body)
    const proof = JSON.parse(response.body)
    assert.equal(proof.peer, source); assert.equal(proof.path, path); assert.equal(proof.rawHash, createHash('sha256').update(raw).digest('hex'))
    cases.push({ name: 'raw-https-signed-socket', source, path, bytes: raw.length, status: response.status })
  }
  for (const [path, body, headers, method, expected] of [
    ['/didar/login', Buffer.from('x'), { 'Content-Encoding': 'gzip' }, 'POST', 415],
    ['/didar/login', Buffer.alloc(1200001), {}, 'POST', 413],
    ['/didar/login', Buffer.alloc(0), {}, 'GET', 405],
    ['/api/didar/%6cogin', Buffer.alloc(0), {}, 'POST', 400],
  ]) { const response = await send(frontPort, path, body, '127.0.0.1', headers, method); assert.equal(response.status, expected); cases.push({ name: 'fail-closed-negative', path, status: response.status }) }
  await stop()
  for (const mode of ['missing-key', 'rewritten-peer']) {
    await launch(frontPort, relayPort, mode)
    const response = await send(frontPort, '/didar/login', Buffer.from('{}'), '127.0.0.1', { 'X-Real-IP': '203.0.113.8' })
    assert.equal(response.status, 503); cases.push({ name: mode, status: response.status }); await stop()
  }
  const result = { status: 'PASS', scope: 'isolated exact Debian binaries on Debian13 executor, not target installation', nginx: '1.26.3-3+deb13u9', njs: '0.8.9-1',
    packages: JSON.parse(readFileSync(join(packageDirectory, 'packages.json'), 'utf8')), sourceHashes: Object.fromEntries(['sign.mjs', 'auth.mjs'].map(f => [f, sha(join(output, f))])),
    binaryHashes: { nginx: sha(binary), njs: sha(njs), httpJsModule: sha(moduleFile) }, cases, vectors: vectors.positive.length, invalidPeers: vectors.invalidPeers.length, freshDistinctNonces: nonces.size,
    limitations: ['No target-server installation, module-path or public HTTPS acceptance performed'],
    capabilities: ['crypto SHA256/HMAC', 'WebCrypto CSPRNG', 'requestBuffer raw bytes', 'process.env inherited key', 'original realip_remote_addr socket', 'TLS verify CA/SAN', 'base64url', 'dynamic-module ABI loading'] }
  writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'PASS', httpCases: cases.length, vectors: vectors.positive.length, freshDistinctNonces: nonces.size }))
} catch (error) {
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ status: 'FAIL', error: String(error), stack: error.stack, cases }, null, 2) + '\n')
  throw error
} finally {
  await stop()
  if (relay) await new Promise(r => relay.close(r))
  for (const child of children) child.kill('SIGTERM')
  if (existsSync(privateKey)) unlinkSync(privateKey)
  flush()
}
