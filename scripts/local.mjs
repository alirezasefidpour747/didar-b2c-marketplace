import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { ensureLocalConfig, readLocalConfig, prerequisites, capture, freePort, run, waitHTTP, managedProcesses } from './local/runtime.mjs'
import { startDataServices, validateDataConfiguration } from './local/services.mjs'
import { ownedDevCommand } from './local/session.mjs'

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const mode = process.argv[2]
const lock = '.local/dev.json'
const processes = managedProcesses()
let ownsLock = false, stopping = false
function assertNoDev() {
  if (!existsSync(lock)) return
  const saved = JSON.parse(readFileSync(lock, 'utf8'))
  try { process.kill(saved.pid, 0) } catch (error) {
    if (error.code !== 'ESRCH') throw error
    rmSync(lock)
    return
  }
  throw new Error('A local setup/dev/test session is active. Wait for it or use Ctrl+C in its terminal; no server was stopped.')
}
function acquireLock() {
  assertNoDev()
  mkdirSync('.local', { recursive: true, mode: 0o700 })
  writeFileSync(lock, JSON.stringify({ pid: process.pid, mode }), { mode: 0o600, flag: 'wx' })
  ownsLock = true
}
async function cleanup() {
  await processes.close()
  if (ownsLock) { rmSync(lock, { force: true }); ownsLock = false }
}
for (const signal of mode === 'test' ? [] : ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, async () => {
  if (stopping) return
  stopping = true
  await cleanup()
  process.exit(signal === 'SIGINT' ? 130 : 143)
})
async function main() {
  if (!['setup', 'dev', 'stop', 'status', 'services', 'test'].includes(mode)) throw new Error('Use: bun run local:setup | local:dev | local:stop | local:status | local:test')
  if (mode === 'stop') {
    if (!existsSync(lock)) { console.log('No owned local session; no process was stopped.'); return }
    const session = JSON.parse(readFileSync(lock, 'utf8'))
    if (session.mode !== 'dev' || !Number.isSafeInteger(session.pid) || session.pid <= 1)
      throw new Error('Refusing to stop a setup/test or invalid session; use its own terminal')
    try { process.kill(session.pid, 0) } catch (error) {
      if (error.code !== 'ESRCH') throw error
      rmSync(lock); console.log('Stale local session record removed; no process was stopped.'); return
    }
    // ps -o command= is supported by both macOS/BSD and Linux. Never signal a reused/unrelated PID.
    const command = capture('ps', ['-p', String(session.pid), '-o', 'command='])
    if (!ownedDevCommand(command))
      throw new Error('Refusing to stop an unrecognized process; the session file was preserved')
    process.kill(session.pid, 'SIGINT')
    for (let n = 0; n < 40; n++) {
      try { process.kill(session.pid, 0) } catch (error) { if (error.code === 'ESRCH') { console.log('Owned local servers stopped; database services, UIDs and orders retained.'); return } }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Local shutdown still pending; inspect its terminal. No force-kill was issued.')
  }
  prerequisites()
  if (mode === 'test') {
    acquireLock()
    // Test owns its own disposable services, credentials and app ports; UAT config is not read.
    const { testLocal } = await import('./local/test.mjs')
    if (process.argv.slice(3).some(arg => !['--reuse-build','--no-demo-install-only'].includes(arg))) throw new Error('Unknown test option; use --reuse-build only with a verified receipt')
    await testLocal(processes, { reuseBuild: process.argv.includes('--reuse-build'), noDemoOnly: process.argv.includes('--no-demo-install-only') })
    return
  }
  const env = mode === 'setup' ? ensureLocalConfig() : readLocalConfig()
  validateDataConfiguration(env)
  if (mode === 'status') {
    let failed = false
    let native = false
    try {
      const session = JSON.parse(readFileSync(lock, 'utf8'))
      process.kill(session.pid, 0)
      native = session.mode === 'dev'
    } catch {}
    console.log(native ? 'Native local:dev session active' : 'Native local:dev session NOT_RUNNING; occupied endpoints may belong to another stack')
    if (!native) failed = true
    for (const [name, args] of [
      ['PostgreSQL', ['exec', 'didar-postgres', 'pg_isready', '-t', '10', '-U', 'postgres', '-d', 'didar']],
      ['Redis', ['exec', 'didar-redis', 'redis-cli', 'ping']],
    ]) {
      try { capture('docker', args); console.log(`${name}: ready (local data retained)`) }
      catch { console.log(`${name}: NOT_READY; run bun run local:setup`); failed = true }
    }
    for (const [name, url, check] of [
      ['API health', 'http://127.0.0.1:9000/health', async r => await r.text() === 'OK'],
      ['API catalog', 'http://127.0.0.1:9000/didar/catalog', async r => { const d = await r.json(); return Array.isArray(d.products) && !!d.rate }],
      ['Storefront proxy', 'http://127.0.0.1:3000/api/didar/catalog', async r => { const d = await r.json(); return Array.isArray(d.products) && !!d.rate }],
    ]) {
      try { await waitHTTP(url, check, 15000); console.log(`${name}: ready`) }
      catch { console.log(`${name}: NOT_READY; run bun run local:dev (check port conflicts)`); failed = true }
    }
    console.log('MAC_UAT_PENDING: native Mac and physical RFID acceptance are owner-run checks, not established by this diagnostic.')
    if (failed) process.exitCode = 1
    return
  }
  if (mode === 'setup') {
    assertNoDev()
    // Detect full Compose or another app occupying native ports before modifying the database.
    await freePort(9000); await freePort(3000)
    acquireLock()
    await run('bun', ['install', '--frozen-lockfile'], { env: { ...env, NODE_ENV: 'development' } })
  }
  await startDataServices()
  if (mode === 'services') return
  if (mode === 'setup') {
    await run('bun', ['run', 'db:setup'], { env: { ...env, NODE_ENV: 'development' } })
    await run('bun', ['run', '--cwd', 'packages/api', 'codegen'], { env })
    await run('bun', ['run', 'build:panels'], { env: { ...env, NODE_ENV: 'production' } })
    console.log('Setup complete. Existing database, UIDs, orders and passwords preserved. Run bun run local:dev')
    return
  }
  assertNoDev()
  await freePort(9000); await freePort(3000)
  acquireLock()
  // Shared ephemeral local-only signing material; never rewrite the owner's env files.
  const authEnv = {...env, DIDAR_AUTH_NETWORK_KEY: env.DIDAR_AUTH_NETWORK_KEY || randomBytes(32).toString('hex'), DIDAR_AUTH_PROXY_PEERS: env.DIDAR_AUTH_PROXY_PEERS || '127.0.0.1,::1'}
  const privateWebPort = await freePort()
  const api = processes.start('bun', ['run', '--cwd', 'packages/api', 'dev', '--host', '127.0.0.1', '--port', '9000'], { env: { ...authEnv, NODE_ENV: 'development' } })
  const web = processes.start('bun', ['run', '--cwd', 'apps/storefront', 'dev', '--hostname', '127.0.0.1', '--port', String(privateWebPort)], { env: { ...authEnv, NODE_ENV: 'development' } })
  const ingress = processes.start('node', [resolve('apps/storefront/auth-ingress.mjs')], {env: {...authEnv, DIDAR_AUTH_STOREFRONT_URL: `http://127.0.0.1:${privateWebPort}`, DIDAR_AUTH_INGRESS_HOST: '127.0.0.1', DIDAR_AUTH_INGRESS_PORT: '3000'}})
  const exited = Promise.race([api, web, ingress].map(child => new Promise((_, reject) => {
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`A local server exited (${code}); both owned servers are stopping`)))
  })))
  await Promise.race([Promise.all([
    waitHTTP('http://127.0.0.1:9000/health', async r => await r.text() === 'OK'),
    waitHTTP('http://127.0.0.1:3000/api/didar/catalog', async r => { const d = await r.json(); return Array.isArray(d.products) && !!d.rate }),
  ]), exited])
  console.log('Didar local servers ready on ports 3000/9000. Ctrl+C stops both servers; PostgreSQL, UIDs and orders persist.')
  await exited
}
try { await main() }
catch (error) { if (!stopping) { console.error(error.message); process.exitCode = 1 } }
finally { await cleanup() }
