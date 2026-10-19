import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { recordProcessClose } from './ci/process-receipts.mjs'
// Panel tooling loads production Medusa config to discover route bases/extensions.
// Use fresh, build-only values instead of reading or baking runtime credentials.
// These values never enter Docker ENV or weaken startup's required-secret checks.
const env = {
  ...process.env,
  JWT_SECRET: randomBytes(32).toString('hex'),
  COOKIE_SECRET: randomBytes(32).toString('hex'),
  MERCUR_DISABLE_TELEMETRY: 'true',
}
for (const panel of ['admin', 'vendor']) {
  const started_at = new Date().toISOString()
  const child = spawnSync('bun', ['run', '--cwd', `apps/${panel}`, 'build'], {
    env,
    stdio: 'inherit',
  })
  recordProcessClose('build-' + panel, { code: child.status, signal: child.signal, error: child.error }, { environment: env, started_at, observer: 'spawnSync' })
  if (child.error) throw child.error
  if (child.status !== 0) process.exit(child.status ?? 1)
}
