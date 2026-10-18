import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLocalDocker, capture } from './local/runtime.mjs'
import { dockerDatabaseRelay } from './local/docker-relay.mjs'
import { backendFiles } from './local/test.mjs'
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const mode = process.argv[2] || 'all'
if (!['all', 'api', 'browser', 'check'].includes(mode)) throw new Error('Use: node scripts/test-compose.mjs [all|api|browser|check]')
assertLocalDocker()
const docker = args => capture('docker', args)
function inspect(service) {
  const id = docker(['compose', 'ps', '-q', service])
  if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error(`Missing running Compose service: ${service}`)
  return JSON.parse(docker(['inspect', id]))[0]
}
const api = inspect('api'), web = inspect('storefront'), postgres = inspect('postgres')
const environment = Object.fromEntries(api.Config.Env.map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)] }))
if (environment.DIDAR_ENVIRONMENT !== 'local' || environment.DIDAR_PAYMENT_MODE !== 'sandbox' || environment.DIDAR_SEED_DEMO !== 'true')
  throw new Error('Refusing demo tests: API must explicitly run as local sandbox with demo fixtures, never staging/production')
function loopbackPort(container, port) {
  const bindings = container.NetworkSettings.Ports[`${port}/tcp`]
  if (!bindings?.length || bindings.some(b => !['127.0.0.1', '::1'].includes(b.HostIp)))
    throw new Error('Refusing demo tests on non-loopback application ports')
  return bindings[0].HostPort
}
// The packaged storefront shares the API network namespace; API owns both bindings.
const apiPort = loopbackPort(api, 9000), webPort = loopbackPort(web.HostConfig.NetworkMode === `container:${api.Id}` ? api : web, 3000)
const network = Object.keys(api.NetworkSettings.Networks).find(name => postgres.NetworkSettings.Networks[name])
if (!network || postgres.NetworkSettings.Ports?.['5432/tcp']?.length)
  throw new Error('Expected shared private Compose database with no published PostgreSQL port')
const database = new URL(environment.DATABASE_URL)
const aliases = postgres.NetworkSettings.Networks[network].Aliases || []
if (!['postgres', ...aliases].includes(database.hostname) || database.port && database.port !== '5432')
  throw new Error('API database must target the inspected private PostgreSQL service')
const relay = await dockerDatabaseRelay(api.Id, database)
database.hostname = '127.0.0.1'; database.port = String(relay.port)
const env = { ...process.env, DATABASE_URL: database.toString(), TEST_API_URL: `http://127.0.0.1:${apiPort}`, TEST_STOREFRONT_URL: `https://127.0.0.1:${webPort}` }
const checks = []
if (mode !== 'browser' && mode !== 'check') checks.push(['test', ...backendFiles])
if (mode !== 'api' && mode !== 'check') checks.push(['run', 'test:e2e'])
let child
const cancel = async () => { child?.kill('SIGTERM'); await relay.close(); process.exit(130) }
process.once('SIGINT', cancel); process.once('SIGTERM', cancel)
try {
  if (mode === 'check') {
    const { Pool } = createRequire(import.meta.url)('../packages/api/node_modules/pg')
    const pool = new Pool({ connectionString: database.toString(), connectionTimeoutMillis: 15000 })
    try {
      const { rows } = await pool.query('SELECT count(*)::int AS units FROM didar_inventory_item')
      console.log(`Private Compose SQL relay ready; ${rows[0].units} physical records read, no writes.`)
    } finally { await pool.end() }
  }
  if (mode !== 'check') console.log('Running explicit local Compose fixture tests through Docker exec; credentials withheld. Prefer local:test for a fresh disposable database.')
  for (const args of checks) {
    const code = await new Promise((resolve, reject) => {
      child = spawn('bun', args, { env, stdio: 'inherit' })
      child.once('error', reject); child.once('exit', resolve)
    })
    if (code !== 0) { process.exitCode = code || 1; break }
  }
} finally { await relay.close(); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel) }
