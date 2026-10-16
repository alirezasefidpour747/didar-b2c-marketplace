import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.env.DIDAR_STAGING_ROOT || '/srv/didar-staging')
mkdirSync(`${root}/shared`, { recursive: true, mode: 0o700 })
const file = `${root}/shared/staging.env`
const expected = { DIDAR_ENVIRONMENT: 'staging', DIDAR_SEED_DEMO: 'false', DIDAR_PAYMENT_MODE: 'sandbox' }
try {
  writeFileSync(file, Object.entries({ ...expected,
    DIDAR_DB_PASSWORD: randomBytes(32).toString('hex'),
    JWT_SECRET: randomBytes(32).toString('hex'), COOKIE_SECRET: randomBytes(32).toString('hex'),
  }).map(([k,v]) => `${k}=${v}\n`).join(''), { flag: 'wx', mode: 0o600 })
  console.log('Created private staging configuration; values withheld.')
} catch (error) { if (error.code !== 'EEXIST') throw error }
if ((statSync(file).mode & 0o077) !== 0) throw new Error('staging.env must have mode 0600')
const env = {}
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue
  const match = /^([A-Z_]+)=([A-Za-z0-9_-]+)$/.exec(line)
  if (!match || Object.hasOwn(env, match[1])) throw new Error('Use unique KEY=VALUE lines; values withheld')
  env[match[1]] = match[2]
}
for (const [key,value] of Object.entries(expected)) if (env[key] !== value) throw new Error(`Unsafe ${key}; file preserved`)
for (const key of ['DIDAR_DB_PASSWORD','JWT_SECRET','COOKIE_SECRET']) if (!/^[a-f0-9]{64}$/.test(env[key] || '')) throw new Error(`${key} must be 64 lowercase hex characters; file preserved`)
if (env.JWT_SECRET === env.COOKIE_SECRET) throw new Error('JWT and cookie secrets must differ')
console.log('Staging configuration validated and preserved.')
