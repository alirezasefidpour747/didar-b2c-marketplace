// Source-level topology gap probe, not Nginx/Docker/owner-host acceptance.
// Run from the repository root at the pinned release. Uses only synthetic data.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const release = '874447e6ec8fc58af3f09a87a4131b45c550a478';
const root = resolve('.');
const temp = mkdtempSync(join(tmpdir(), 'didar-topology-'));
const output = resolve('.local/topology-874447e'); mkdirSync(output, { recursive: true });
mkdirSync(join(temp, 'node_modules/@didar/auth-network'), { recursive: true });
for (const file of ['index.cjs', 'package.json']) copyFileSync(join(root, 'packages/auth-network', file), join(temp, 'node_modules/@didar/auth-network', file));
copyFileSync(join(root, 'apps/storefront/auth-ingress.mjs'), join(temp, 'ingress.mjs'));
const { HEADER, signNetwork, verifyNetwork } = createRequire(join(temp, 'probe.cjs'))('@didar/auth-network');
const key = randomBytes(32).toString('hex');
const body = Buffer.from('{"email":"synthetic@example.invalid","password":"synthetic-only"}');
const observations = [];
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  let proof = null;
  if (req.headers[HEADER]) proof = verifyNetwork({ key, assertion: req.headers[HEADER], method: req.method, path: req.url, body: bytes });
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ upstream: 'NEXT_STUB', path: req.url, asserted_peer: proof?.peer || null, forwarded_for: req.headers['x-forwarded-for'] || null, real_ip: req.headers['x-real-ip'] || null }));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const reserve = http.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r));
const ingressPort = reserve.address().port; await new Promise(r => reserve.close(r));
const child = spawn(process.execPath, [join(temp, 'ingress.mjs')], { cwd: temp, env: { ...process.env, DIDAR_AUTH_NETWORK_KEY: key, DIDAR_AUTH_STOREFRONT_URL: `http://127.0.0.1:${server.address().port}`, DIDAR_AUTH_INGRESS_HOST: '127.0.0.1', DIDAR_AUTH_INGRESS_PORT: String(ingressPort), DIDAR_AUTH_INGRESS_TLS_CERT_FILE: '', DIDAR_AUTH_INGRESS_TLS_KEY_FILE: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const childExit = once(child, 'exit');
let stderr = ''; child.stderr.on('data', d => { stderr += d; });
const proxy = http.createServer((req, res) => {
  const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress, 'x-real-ip': req.socket.remoteAddress };
  const upstream = http.request({ host: '127.0.0.1', port: ingressPort, method: req.method, path: req.url, headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
});
function request(port, path, localAddress, headers = {}, bytes = body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, localAddress, method: bytes === null ? 'GET' : 'POST', headers: { ...headers, ...(bytes ? { 'content-type': 'application/json', 'content-length': String(bytes.length) } : {}) } }, res => {
      const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (e) { reject(e); } });
    });
    req.setTimeout(5000, () => req.destroy(Error('probe request timeout'))); req.on('error', reject); req.end(bytes || undefined);
  });
}
let status = 'FAIL', failure = null, close = null;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('ingress readiness timeout')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('signed auth ingress ready')) { clearTimeout(timer); resolve(); } });
    child.once('error', e => { clearTimeout(timer); reject(e); });
  });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const fake = signNetwork({ key, peer: '203.0.113.99', method: 'POST', path: '/api/didar/login', body });
  const direct = await request(ingressPort, '/api/didar/login', '127.0.0.2', { [HEADER]: fake, 'x-forwarded-for': '203.0.113.99', 'x-real-ip': '203.0.113.99' });
  assert.equal(direct.body.asserted_peer, '127.0.0.2'); assert.equal(direct.body.forwarded_for, null); assert.equal(direct.body.real_ip, null);
  observations.push({ check: 'direct first-hop uses socket and replaces forged headers', result: 'PASS', peer: direct.body.asserted_peer });
  const peers = [];
  for (const source of ['127.0.0.2', '127.0.0.3']) peers.push((await request(proxy.address().port, '/api/didar/login', source)).body.asserted_peer);
  assert.deepEqual(peers, ['127.0.0.1', '127.0.0.1']);
  observations.push({ check: 'ordinary HTTP reverse proxy collapses two client sockets at current signer', result: 'GAP_REPRODUCED', peers, note: 'Node HTTP proxy models a new upstream socket; this is not an actual Nginx/Docker test.' });
  const replaced = await request(proxy.address().port, '/api/didar/login', '127.0.0.2', { [HEADER]: fake });
  assert.equal(replaced.body.asserted_peer, '127.0.0.1');
  observations.push({ check: 'pre-signing before unchanged ingress does not preserve the proof', result: 'GAP_REPRODUCED', peer: replaced.body.asserted_peer });
  const routes = [];
  for (const path of ['/dashboard', '/seller', '/auth/user/emailpass', '/admin/didar/pages', '/vendor/didar/pages', '/didar/catalog', '/static/synthetic.jpg', '/api/didar/image?id=synthetic']) {
    const response = await request(ingressPort, path, '127.0.0.2', {}, null);
    assert.equal(response.body.upstream, 'NEXT_STUB'); routes.push({ path, actual_upstream: response.body.upstream });
  }
  observations.push({ check: 'all paths use one configured Next upstream', result: 'GAP_REPRODUCED', routes, note: 'Stub identifies transport target; it is not a native-panel success assertion.' });
  for (const mutation of [{ method: 'GET', path: '/api/didar/login', body }, { path: '/api/didar/register', body }, { path: '/api/didar/login', body: Buffer.from('changed') }]) assert.throws(() => verifyNetwork({ key, assertion: fake, method: 'POST', ...mutation }));
  observations.push({ check: 'existing v1 proof binds exact method/path/body', result: 'PASS' });
  status = 'AUDIT_PASS_DEPLOYMENT_BLOCKED';
} catch (e) { failure = String(e.stack || e); process.exitCode = 1; }
finally {
  child.kill('SIGTERM');
  let timer; close = await Promise.race([childExit, new Promise(r => { timer = setTimeout(() => { child.kill('SIGKILL'); r(['NOT_OBSERVED', 'ESCALATED']); }, 5000); })]); clearTimeout(timer);
  for (const s of [proxy, server]) { s.closeAllConnections(); if (s.listening) await new Promise(r => s.close(r)); }
  const result = { release, status, observations, failure, child_exit: { code: close?.[0], signal: close?.[1] }, stderr, node: process.versions.node, source_hashes: Object.fromEntries(['apps/storefront/auth-ingress.mjs', 'packages/auth-network/index.cjs', 'scripts/deployment/storefront.mjs', 'compose.yaml'].map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')])), not_executed: ['Actual Nginx HTTPS topology', 'Docker bridge/NAT', 'PostgreSQL nonce/quota integration', 'Native panel browser acceptance', 'Owner server or Internet verification'], boundary: 'Successful probe execution proves current-source gaps, not readiness of a proposed deployment.' };
  writeFileSync(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2)); rmSync(temp, { recursive: true, force: true });
}
