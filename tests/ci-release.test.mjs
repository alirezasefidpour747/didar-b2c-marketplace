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
