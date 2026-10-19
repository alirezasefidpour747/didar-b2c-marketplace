import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { requireSHA, requireDigest, validateManifest, fileHash, loadBundle } from '../scripts/ci/release.mjs';
const sha = 'a'.repeat(40), digest = 'sha256:' + 'b'.repeat(64);
const fixture = () => ({ format: 1, source_sha: sha,
  images: Object.fromEntries(['api', 'storefront'].map(role => [role, { id: digest, local_tag: `didar-release-${role}:sha-${sha}`, revision: sha, platform: 'linux/amd64' }])),
  archive: 'images.tar.gz', archive_sha256: 'c'.repeat(64), verification: { build: { status: 'PASS' }, independent_artifacts: { status: 'NOT_EXECUTED' } } });
test('release source accepts only exact lowercase commit identities, never refs or shell text', () => {
  assert.equal(requireSHA(sha), sha);
  for (const value of ['main', 'a'.repeat(39), 'A'.repeat(40), sha + '\n', '$(id)', '', undefined]) assert.throws(() => requireSHA(value));
});
test('registry manifest digest cannot be replaced by a mutable tag', () => {
  assert.equal(requireDigest(digest), digest);
  for (const value of ['latest', 'ghcr.io/example/api:main', 'sha256:' + 'x'.repeat(64), 'b'.repeat(64)]) assert.throws(() => requireDigest(value));
});
test('manifest binds source, both images, platform and actual revision labels', () => {
  assert.equal(validateManifest(fixture(), sha).source_sha, sha);
  for (const change of [
    m => { m.source_sha = 'd'.repeat(40); },
    m => { m.images.api.revision = 'd'.repeat(40); },
    m => { m.images.storefront.platform = 'linux/arm64'; },
    m => { delete m.images.storefront; },
    m => { m.images.api.local_tag = 'api:latest'; },
  ]) { const m = fixture(); change(m); assert.throws(() => validateManifest(m, sha)); }
});
test('archive path traversal and unverified builds are rejected', () => {
  for (const change of [m => { m.archive = '../../outside.tar.gz'; }, m => { m.verification.build.status = 'FAIL'; }, m => { m.archive_sha256 = 'not-a-checksum'; }]) {
    const m = fixture(); change(m); assert.throws(() => validateManifest(m, sha));
  }
});
test('archive checksums cover actual bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'didar-ci-hash-'));
  try {
    await writeFile(join(dir, 'bytes'), 'abc');
    assert.equal(await fileHash(join(dir, 'bytes')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('tampered release archive fails before any Docker load can occur', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'didar-ci-tamper-'));
  try {
    await writeFile(join(dir, 'release-manifest.json'), JSON.stringify(fixture()));
    await writeFile(join(dir, 'images.tar.gz'), 'tampered archive');
    await assert.rejects(loadBundle(dir, sha), /Archive digest mismatch/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// Focused sequencing contract for the real-HTTP fixture used by verify-images.
const { connectAdminFixture } = await import('../verification/auth-packaging/reviewer/admin-fixture.mjs');
function adminFixture(failure = {}) {
  const calls = [];
  const responses = [
    { status: 200, body: { token: 'native-secret' } },
    { status: 403 },
    { status: 200, body: { token: 'canonical-secret', user: { id: 'demo-admin', role: 'admin' } } },
    { status: 200 }, { status: 200, body: { user: { id: 'demo-admin', role: 'admin' } } },
  ];
  for (const [index, value] of Object.entries(failure)) responses[index] = value;
  const invoke = async (api, path, options) => { calls.push({ api, path, options }); return responses[calls.length - 1]; };
  return { calls, run: () => connectAdminFixture({ api: 'http://owned-qa', source: '127.0.0.94', request: invoke,
    login: (api, source, body) => invoke(api, '/didar/login', { source, body }) }) };
}
test('release Admin fixture requires native denial then canonical proof and verified connect', async () => {
  const f = adminFixture(), receipt = await f.run();
  assert.deepEqual(f.calls.map(c => c.path), ['/auth/user/emailpass', '/admin/didar/context', '/didar/login', '/admin/didar/connect', '/admin/didar/context']);
  assert.equal(f.calls[3].options.headers.authorization, 'Bearer native-secret');
  assert.equal(f.calls[3].options.body.didar_token, 'canonical-secret');
  assert.equal(receipt.unlinked_context_status, 403);
  assert.equal(receipt.linked_context_status, 200);
  assert.ok(!JSON.stringify(receipt).includes('secret'));
});
test('release Admin fixture fails closed on premature access, wrong authority, absent proof or denied connect', async () => {
  for (const failure of [
    { 0: { status: 401 } }, { 1: { status: 200 } },
    { 2: { status: 200, body: { token: 'secret', user: { id: 'demo-admin', role: 'customer' } } } },
    { 2: { status: 200, body: { user: { id: 'demo-admin', role: 'admin' } } } },
    { 3: { status: 403 } }, { 4: { status: 403 } },
    { 4: { status: 200, body: { user: { id: 'different-admin', role: 'admin' } } } },
  ]) await assert.rejects(adminFixture(failure).run());
});

const { prepareInstallKit, verifyInstallKit, kitFiles } = await import('../scripts/ci/install-kit.mjs');
test('matching installation kit binds source and every reviewed config byte while target stays blocked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'didar-kit-'));
  try {
    const receipt = await prepareInstallKit(dir, sha);
    const files = await verifyInstallKit(dir, sha, receipt);
    assert.equal(files.length, kitFiles.length + 1);
    await assert.rejects(verifyInstallKit(dir, 'e'.repeat(40), receipt));
    await writeFile(join(dir, 'install-kit', kitFiles[0]), 'tampered');
    await assert.rejects(verifyInstallKit(dir, sha, receipt), /Installation kit byte mismatch/);
    assert.equal(receipt.target_config, 'BLOCKED');
    assert.ok(kitFiles.every(f => !/\.env$|\.key$|\.pem$/.test(f)));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

const { requirePublishableBundle } = await import('../scripts/ci/release.mjs');
test('legacy verifier success cannot authorize Nginx topology publication', () => {
  const m = fixture();
  assert.throws(() => requirePublishableBundle(m));
  m.verification.independent_artifacts.status = 'PASS';
  assert.doesNotThrow(() => requirePublishableBundle(m));
  m.install_kit = { target_config: 'BLOCKED' };
  assert.throws(() => requirePublishableBundle(m), { code: 'ERR_ASSERTION', operator: 'strictEqual' });
});

const { reserveLoopbackPorts, assertLoopbackMappings } = await import('../scripts/ci/loopback-ports.mjs');
test('real fixture ports are distinct and only the exact loopback mappings survive restart', async () => {
  const [api, ingress] = await reserveLoopbackPorts();
  assert.notEqual(api, ingress);
  assert.ok([api, ingress].every(p => Number.isInteger(p) && p > 0 && p <= 65535));
  const expected = { '9000/tcp': api, '3000/tcp': ingress };
  const mappings = Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, [{ HostIp: '127.0.0.1', HostPort: String(value) }]]));
  assert.doesNotThrow(() => assertLoopbackMappings(mappings, expected));
  for (const change of [
    m => { m['9000/tcp'][0].HostPort = String(api + 1); },
    m => { m['9000/tcp'][0].HostIp = '0.0.0.0'; },
    m => { m['3001/tcp'] = [{ HostIp: '127.0.0.1', HostPort: '3001' }]; },
    m => { m['3000/tcp'].push({ HostIp: '::', HostPort: String(ingress) }); },
  ]) { const m = structuredClone(mappings); change(m); assert.throws(() => assertLoopbackMappings(m, expected)); }
});

test('standalone Nginx runbook has a complete local policy/guide closure and current protected entrypoint', async () => {
  const { readFile } = await import('node:fs/promises');
  const { posix } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'didar-kit-docs-'));
  try {
    const receipt = await prepareInstallKit(dir, sha);
    await verifyInstallKit(dir, sha, receipt);
    const guide = 'docs/deployment/PR31_R5_R6.md';
    const text = await readFile(join(dir, 'install-kit', guide), 'utf8');
    for (const [, link] of text.matchAll(/\]\(([^)]+\.md)\)/g)) {
      const file = posix.normalize(posix.join(posix.dirname(guide), link));
      assert.ok(kitFiles.includes(file), 'Required standalone guide missing: ' + file);
      assert.ok((await readFile(join(dir, 'install-kit', file))).length > 0);
    }
    const entrypoint = await readFile(new URL('../docs/CI_RELEASE_INSTALL.md', import.meta.url), 'utf8');
    assert.match(entrypoint, /install-kit\/docs\/deployment\/PR31_R5_R6\.md/);
    assert.match(entrypoint, /NGINX_INSTALL_WRAPPER\.md/);
    assert.doesNotMatch(entrypoint, /install-kit\/docs\/deployment\/PR31_RELEASE_PREPARATION\.md/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
