// The same four serial commands formerly joined by && in build:all.
import { spawnSync } from 'node:child_process'
import { recordProcessClose } from './ci/process-receipts.mjs'
for (const [stage, args] of [
  [null, ['run', '--cwd', 'packages/api', 'codegen']],
  [null, ['run', 'build:panels']],
  ['build-api', ['run', '--cwd', 'packages/api', 'build']],
  ['build-storefront', ['run', '--cwd', 'apps/storefront', 'build']],
]) {
  const started_at = new Date().toISOString()
  const child = spawnSync('bun', args, { env: process.env, stdio: 'inherit' })
  recordProcessClose(stage, { code: child.status, signal: child.signal, error: child.error }, { started_at, observer: 'spawnSync' })
  if (child.error) throw child.error
  if (child.status !== 0) process.exit(child.status ?? 1)
}
