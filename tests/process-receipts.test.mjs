import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { run as localRun } from '../scripts/local/runtime.mjs'
import { requiredStages, recordProcessClose, observeProcessClose, validateRecordedStages } from '../scripts/ci/process-receipts.mjs'

const source = 'a'.repeat(40), stale = 'b'.repeat(40)
const environment = { DIDAR_PROCESS_EVIDENCE: 'true', DIDAR_RELEASE_SOURCE: source, GITHUB_SHA: stale }
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'didar-process-receipts-'))
  try { return await fn({ root, path: join(root, 'receipts.jsonl') }) } finally { await rm(root, { recursive: true, force: true }) }
}
const records = async path => (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
async function childReceipt(path, stage, script, args = [], extra = {}) {
  const started_at = new Date().toISOString()
  const child = spawn(process.execPath, ['-e', script, ...args], { stdio: 'ignore', env: { ...process.env, ...extra } })
  return observeProcessClose(child, stage, { environment, path, started_at })
}

test('actual close records numeric 0 and 7 without inferring outcome from output', async () => fixture(async ({ path }) => {
  const zero = await childReceipt(path, 'build-admin', 'process.stdout.write("FAIL is only text");process.exit(0)')
  const seven = await childReceipt(path, 'build-vendor', 'process.stdout.write("PASS is only text");process.exit(7)')
  assert.equal(zero.code, 0); assert.equal(seven.code, 7)
  const rows = await records(path)
  assert.deepEqual(rows.map(row => [row.code, row.signal, row.spawn_error, row.observer]), [[0, null, null, 'close'], [7, null, null, 'close']])
  assert.deepEqual(rows.map(row => row.source_sha), [source, source])
}))

test('actual SIGTERM close retains null numeric code and signal instead of inventing success or 143', async () => fixture(async ({ path }) => {
  const result = await childReceipt(path, 'backend-regressions', 'process.kill(process.pid,"SIGTERM")')
  assert.equal(result.code, null); assert.equal(result.signal, 'SIGTERM')
  const [row] = await records(path)
  assert.equal(row.code, null); assert.equal(row.signal, 'SIGTERM'); assert.equal(row.spawn_error, null)
}))

test('actual ENOENT emits one spawn-error/close receipt with its observed code', async () => fixture(async ({ root, path }) => {
  const child = spawn(join(root, 'missing-executable'), ['https://private.invalid/credential'], { stdio: 'ignore' })
  const result = await observeProcessClose(child, 'native-http', { environment, path })
  assert.equal(result.error.code, 'ENOENT')
  const rows = await records(path)
  assert.equal(rows.length, 1); assert.equal(rows[0].code, result.code); assert.equal(rows[0].signal, result.signal); assert.equal(rows[0].spawn_error, 'ENOENT')
  assert.notEqual(rows[0].code, 0)
}))

test('synchronous build result preserves actual status and spawn failures', async () => fixture(async ({ root, path }) => {
  for (const [stage, command, args] of [['build-api', process.execPath, ['-e', 'process.exit(7)']], ['build-storefront', join(root, 'missing-executable'), []]]) {
    const started_at = new Date().toISOString(), result = spawnSync(command, args, { stdio: 'ignore' })
    recordProcessClose(stage, { code: result.status, signal: result.signal, error: result.error }, { environment, path, started_at, observer: 'spawnSync' })
  }
  const rows = await records(path)
  assert.equal(rows[0].code, 7); assert.equal(rows[0].observer, 'spawnSync')
  assert.equal(rows[1].code, null); assert.equal(rows[1].spawn_error, 'ENOENT'); assert.equal(rows[1].observer, 'spawnSync')
}))

test('receipts omit command arguments, URLs, output, raw errors and every supplied environment secret', async () => fixture(async ({ path }) => {
  const url = 'https://private.invalid/account?token=secret-argument-canary', secret = 'SECRET_ENV_CANARY_' + 'x'.repeat(40)
  await childReceipt(path, 'browser-32', 'process.stdout.write(process.argv[1]);process.stderr.write(process.env.PRIVATE_TOKEN);process.exit(0)', [url], { PRIVATE_TOKEN: secret })
  const text = await readFile(path, 'utf8'), [row] = await records(path)
  assert.equal(text.includes(url), false); assert.equal(text.includes(secret), false); assert.equal(text.includes('PRIVATE_TOKEN'), false)
  assert.deepEqual(Object.keys(row).sort(), ['format', 'stage', 'source_sha', 'observer', 'code', 'signal', 'spawn_error', 'started_at', 'closed_at'].sort())
}))

test('unlabelled negative children and ordinary local runs do not write acceptance receipts', async () => fixture(async ({ path }) => {
  const negative = await childReceipt(path, undefined, 'process.exit(7)')
  assert.equal(negative.code, 7)
  assert.equal(recordProcessClose('build-admin', { code: 0, signal: null }, { environment: {}, path }), null)
  await assert.rejects(lstat(path), { code: 'ENOENT' })
  assert.throws(() => recordProcessClose('https://private.invalid/argument', { code: 0, signal: null }, { environment, path }), error => error.message === 'UNKNOWN_PROCESS_RECEIPT_STAGE')
}))

test('explicit logger-only local flag works with exact source and fails closed for missing source', async () => fixture(async ({ path }) => {
  const result = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' })
  assert.throws(() => recordProcessClose('build-admin', { code: result.status, signal: result.signal }, { environment: { DIDAR_PROCESS_EVIDENCE: 'true' }, path }), /PROCESS_RECEIPT_SOURCE_REQUIRED/)
  await assert.rejects(lstat(path), { code: 'ENOENT' })
  recordProcessClose('build-admin', { code: result.status, signal: result.signal }, { environment: { DIDAR_PROCESS_EVIDENCE: 'true', GITHUB_SHA: source }, path, observer: 'spawnSync' })
  assert.equal((await records(path))[0].source_sha, source)
}))

test('CI selection requires all eight actual successful records with exact source and rejects missing/stale/failed/ambiguous input', async () => fixture(async ({ path }) => {
  for (const stage of requiredStages) await childReceipt(path, stage, 'process.exit(0)')
  const rows = await records(path)
  assert.equal(validateRecordedStages(rows, source).status, 'PASS')
  assert.deepEqual(validateRecordedStages(rows, source).stages.map(row => row.stage), requiredStages)
  assert.throws(() => validateRecordedStages(rows.slice(1), source), /MISSING_PROCESS_RECEIPT_STAGE/)
  assert.throws(() => validateRecordedStages([...rows, rows[0]], source), /DUPLICATE_PROCESS_RECEIPT_STAGE/)
  for (const patch of [{ source_sha: stale }, { code: 7 }, { code: null, signal: 'SIGTERM' }, { code: null, spawn_error: 'ENOENT' }, { code: '0' }, { observer: 'inferred-log-summary' }, { command: 'private-command-argument' }]) {
    const changed = structuredClone(rows); Object.assign(changed[0], patch)
    assert.throws(() => validateRecordedStages(changed, source), /STALE_PROCESS_RECEIPT_SOURCE|FAILED_PROCESS_RECEIPT_STAGE|INVALID_PROCESS_RECEIPT_RECORD|INVALID_PROCESS_RECEIPT_FIELDS/)
  }
}))

test('build-all preserves exact serial commands and stops on an actual failing command', async () => fixture(async ({ root }) => {
  const executable = join(root, 'bun'), log = join(root, 'commands.jsonl')
  await writeFile(executable, '#!' + process.execPath + '\nconst fs=require("fs"),a=process.argv.slice(2);fs.appendFileSync(process.env.TEST_COMMAND_LOG,JSON.stringify(a)+"\\n");if(process.env.TEST_FAIL_API==="true"&&a.join(" ")==="run --cwd packages/api build")process.exit(17)\n', { mode: 0o700 })
  const options = { encoding: 'utf8', env: { ...process.env, PATH: root, CI: 'false', GITHUB_ACTIONS: 'false', DIDAR_PROCESS_EVIDENCE: 'false', TEST_COMMAND_LOG: log } }
  const helper = resolve(import.meta.dirname, '../scripts/build-all.mjs')
  const success = spawnSync(process.execPath, [helper], options)
  assert.equal(success.status, 0)
  const expected = [['run', '--cwd', 'packages/api', 'codegen'], ['run', 'build:panels'], ['run', '--cwd', 'packages/api', 'build'], ['run', '--cwd', 'apps/storefront', 'build']]
  assert.deepEqual(await records(log), expected)
  await writeFile(log, '')
  const failed = spawnSync(process.execPath, [helper], { ...options, env: { ...options.env, TEST_FAIL_API: 'true' } })
  assert.equal(failed.status, 17)
  assert.deepEqual(await records(log), expected.slice(0, 3))
}))


test('local run retains exited 7 failure semantics, observes signal/spawn failures and never echoes private arguments', async () => fixture(async ({ root }) => {
  const secret = 'https://private.invalid/argument?credential=canary'
  await assert.rejects(localRun(process.execPath, ['-e', 'process.exit(7)', secret], { stdio: 'ignore' }), error => error.message.includes('exited 7') && !error.message.includes(secret))
  await assert.rejects(localRun(process.execPath, ['-e', 'process.kill(process.pid,"SIGTERM")', secret], { stdio: 'ignore' }), error => error.message.includes('signal SIGTERM') && !error.message.includes(secret))
  await assert.rejects(localRun(join(root, 'missing-executable'), [secret], { stdio: 'ignore' }), error => error.message === 'Process spawn failed: ENOENT')
}))
