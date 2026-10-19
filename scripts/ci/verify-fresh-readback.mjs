// Child verifier: real downloaded encrypted bytes, actual tar process and exact
// original plaintext backup hashes. Never emits credentials or decryption keys.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createDecipheriv } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileHash } from './release.mjs'
import { sha256 } from '../deployment/nginx/stack.mjs'

export async function verifyReadback(contextPath, downloaded) {
  const context = JSON.parse(await readFile(contextPath)), root = resolve(contextPath, '..')
  const bytes = await readFile(join(downloaded, 'initial-backup.aes256gcm'))
  assert.equal(sha256(bytes), context.encryption.ciphertext_sha256)
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(context.encryption.key, 'hex'), Buffer.from(context.encryption.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(context.encryption.tag, 'hex'))
  const archive = join(root, 'actual-downloaded-decrypted-backup.tar'), restored = join(root, 'actual-downloaded-private-backup')
  await writeFile(archive, Buffer.concat([decipher.update(bytes), decipher.final()]), { mode: 0o600, flag: 'wx' }); await mkdir(restored, { mode: 0o700 })
  const result = spawnSync('tar', ['-xf', archive, '-C', restored], { stdio: 'pipe', timeout: 60000 })
  assert.equal(result.status, 0); assert.equal(result.signal, null); assert.equal(result.error, undefined)
  for (const [role, file] of [['postgres', 'postgres.dump'], ['redis', 'redis.rdb'], ['uploads', 'uploads.tar'], ['configuration', 'configuration.private.json']]) assert.equal(await fileHash(join(restored, file)), context.initialRestore.backup_sha256[role])
  const receiptHash = await fileHash(join(root, 'initial-restore.json'))
  assert.equal(await fileHash(join(downloaded, 'initial-restore-receipt.json')), receiptHash)
  return { status: 'PASS', scope: 'FRESH_BACKUP_DURABLE_READBACK', restore_receipt_sha256: receiptHash, backup_sha256: context.initialRestore.backup_sha256, destination_url: context.evidenceURL, actual_artifact_url: process.env.FRESH_BACKUP_ARTIFACT_URL, source_container_ids: context.initialRestore.source_container_ids, initialization_state_sha256: context.initialRestore.initialization_state_sha256, actual_subprocess_exits: [{ stage: 'extract-downloaded-decrypted-backup', code: result.status, signal: result.signal, spawn_error: result.error?.code || null }], limits: ['Disposable QA Actions artifact only; no owner-target secret custody or permanent production backup claim'] }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyReadback(...process.argv.slice(2).map(value => resolve(value))).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(() => { process.stderr.write('FRESH_READBACK_VERIFICATION_FAILED\n'); process.exitCode = 1 })
}
