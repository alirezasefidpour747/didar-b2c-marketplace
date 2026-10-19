import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes, createCipheriv } from 'node:crypto'
import { sha256 } from '../scripts/deployment/nginx/stack.mjs'

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'didar-readback-unit-')), source = join(root, 'backup'), downloaded = join(root, 'downloaded')
  await mkdir(source); await mkdir(downloaded)
  try {
    const backup_sha256 = {}
    for (const [role, file] of [['postgres', 'postgres.dump'], ['redis', 'redis.rdb'], ['uploads', 'uploads.tar'], ['configuration', 'configuration.private.json']]) {
      const bytes = Buffer.from('SYNTHETIC_UNIT_BACKUP_' + role + '_' + randomBytes(20).toString('hex')); await writeFile(join(source, file), bytes, { mode: 0o600 }); backup_sha256[role] = sha256(bytes)
    }
    const tar = join(root, 'backup.tar'), packed = spawnSync('tar', ['-cf', tar, '-C', source, 'postgres.dump', 'redis.rdb', 'uploads.tar', 'configuration.private.json'])
    assert.equal(packed.status, 0)
    const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), encrypted = Buffer.concat([cipher.update(await readFile(tar)), cipher.final()])
    await writeFile(join(downloaded, 'initial-backup.aes256gcm'), encrypted)
    const receipt = { backup_sha256, source_container_ids: { postgres: 'a'.repeat(64), redis: 'b'.repeat(64) }, initialization_state_sha256: 'c'.repeat(64) }
    await writeFile(join(root, 'initial-restore.json'), JSON.stringify(receipt)); await copyFile(join(root, 'initial-restore.json'), join(downloaded, 'initial-restore-receipt.json'))
    const context = { initialRestore: receipt, evidenceURL: 'https://unit.invalid/READBACK_FIXTURE_NOT_TARGET_EVIDENCE', encryption: { key: key.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext_sha256: sha256(encrypted) } }
    const contextPath = join(root, 'context.private.json'); await writeFile(contextPath, JSON.stringify(context), { mode: 0o600 })
    await fn({ root, downloaded, context, contextPath, encrypted })
  } finally { await rm(root, { recursive: true, force: true }) }
}
const execute = f => spawnSync(process.execPath, [new URL('../scripts/ci/verify-fresh-readback.mjs', import.meta.url).pathname, f.contextPath, f.downloaded], { encoding: 'utf8' })

test('actual child verifies downloaded ciphertext, decrypts and compares all four hashes before exit0', async () => fixture(async f => {
  const r = execute(f); assert.equal(r.status, 0); assert.equal(r.signal, null); assert.equal(r.stderr, '')
  const proof = JSON.parse(r.stdout); assert.equal(proof.status, 'PASS'); assert.deepEqual(proof.backup_sha256, f.context.initialRestore.backup_sha256); assert.equal(proof.actual_subprocess_exits[0].code, 0)
  assert.equal(r.stdout.includes(f.context.encryption.key), false); assert.equal(Object.hasOwn(proof, 'exit_code'), false, 'Only the caller that observes child close may attach its actual process exit')
}))
test('tampered downloaded ciphertext fails with actual exit1 and no successful receipt', async () => fixture(async f => {
  f.encrypted[0] ^= 1; await writeFile(join(f.downloaded, 'initial-backup.aes256gcm'), f.encrypted)
  const r = execute(f); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.equal(r.stderr, 'FRESH_READBACK_VERIFICATION_FAILED\n')
}))
test('unchanged ciphertext cannot hide a mismatched plaintext configuration backup checksum', async () => fixture(async f => {
  f.context.initialRestore.backup_sha256.configuration = 'f'.repeat(64); await writeFile(f.contextPath, JSON.stringify(f.context))
  const r = execute(f); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.equal(r.stderr.includes(f.context.encryption.key), false)
}))
