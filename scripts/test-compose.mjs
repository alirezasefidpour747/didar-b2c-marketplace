import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const mode = process.argv[2] || 'all'
if (!['all', 'api', 'browser'].includes(mode)) throw new Error('Use: node scripts/test-compose.mjs [all|api|browser]')
function command(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Docker inspection failed; start the isolated local Compose test stack first')
  return result.stdout.trim()
}
function inspect(service) {
  const id = command(['compose', 'ps', '-q', service])
  if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error(`Missing running Compose service: ${service}`)
  return JSON.parse(command(['inspect', id]))[0]
}
const api = inspect('api'), web = inspect('storefront'), postgres = inspect('postgres')
const environment = Object.fromEntries(api.Config.Env.map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)] }))
if (environment.DIDAR_ENVIRONMENT !== 'local' || environment.DIDAR_PAYMENT_MODE !== 'sandbox')
  throw new Error('Refusing demo tests: API must explicitly run as local sandbox, never staging/production')
function loopbackPort(container, port) {
  const bindings = container.NetworkSettings.Ports[`${port}/tcp`]
  if (!bindings?.length || bindings.some(b => !['127.0.0.1', '::1'].includes(b.HostIp)))
    throw new Error('Refusing demo tests on non-loopback application ports')
  return bindings[0].HostPort
}
const apiPort = loopbackPort(api, 9000), webPort = loopbackPort(web, 3000)
const network = Object.keys(api.NetworkSettings.Networks).find(name => postgres.NetworkSettings.Networks[name])
const ip = network && postgres.NetworkSettings.Networks[network].IPAddress
if (!ip || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip))
  throw new Error('No shared private Linux Docker bridge address; do not expose PostgreSQL publicly for tests')
// Capture the API's database binding in memory. Never print credentials or pass them in argv.
const database = new URL(environment.DATABASE_URL)
database.hostname = ip
const env = { ...process.env, DATABASE_URL: database.toString(), TEST_API_URL: `http://127.0.0.1:${apiPort}`, TEST_STOREFRONT_URL: `http://127.0.0.1:${webPort}` }
const checks = []
if (mode !== 'browser') checks.push(['test', './tests/pricing.test.ts', './tests/inventory.test.ts', './tests/security.test.ts', './tests/commerce.test.ts', './tests/upgraded-commerce.test.ts', './tests/phase1.test.ts', './tests/migrations.test.ts'])
if (mode !== 'api') checks.push(['run', 'test:e2e'])
console.log('Running isolated local Compose checks with fixtures bound to the API database; credentials withheld.')
for (const args of checks) {
  const child = spawnSync('bun', args, { env, stdio: 'inherit' })
  if (child.error) throw child.error
  if (child.status !== 0) process.exit(child.status ?? 1)
}
