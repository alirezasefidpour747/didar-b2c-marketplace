import { randomBytes } from 'node:crypto'
import { mkdirSync, openSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import { recordBuild, verifyBuild } from './build-receipt.mjs'
import { capture, freePort, run, waitHTTP } from './runtime.mjs'

export const backendFiles = ['pricing', 'inventory', 'security', 'commerce', 'upgraded-commerce', 'phase1', 'migrations', 'finance', 'finance-procurement'].map(name => `./tests/${name}.test.ts`)
export async function testLocal(processes, { reuseBuild = false } = {}) {
  if (reuseBuild) verifyBuild()
  const suffix = randomBytes(8).toString('hex')
  const names = [`didar-qa-pg-${suffix}`, `didar-qa-redis-${suffix}`]
  const created = []
  let stopping = false
  async function cleanup() {
    if (stopping) return
    stopping = true
    await processes.close()
    // Remove only this invocation's anonymous test volumes, never the UAT database.
    for (const name of created.reverse()) {
      try { capture('docker', ['rm', '-fv', name]) } catch { console.error(`Test cleanup pending: docker rm -fv ${name}`) }
    }
  }
  const onSignal = async () => { await cleanup(); process.exit(130) }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, onSignal)
  mkdirSync('.local', { recursive: true, mode: 0o700 })
  const apiLog = '.local/test-api.log', webLog = '.local/test-web.log'
  const apiFD = openSync(apiLog, 'w', 0o600), webFD = openSync(webLog, 'w', 0o600)
  try {
    for (const [index, image, port, extra] of [
      [0, 'postgres:17-alpine', 5432, ['-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=didar_qa']],
      [1, 'redis:7-alpine', 6379, []],
    ]) {
      capture('docker', ['run', '-d', '--name', names[index], '--label', 'didar.disposable-qa=true', '-p', `127.0.0.1::${port}`, ...extra, image])
      created.push(names[index])
    }
    function port(name, internal) {
      const state = JSON.parse(capture('docker', ['inspect', name]))[0]
      const bindings = state.NetworkSettings.Ports[`${internal}/tcp`]
      if (!bindings?.length || bindings.some(b => b.HostIp !== '127.0.0.1')) throw new Error('Disposable data services must be loopback-only')
      return bindings[0].HostPort
    }
    const pgPort = port(names[0], 5432), redisPort = port(names[1], 6379)
    for (let n = 0; ; n++) {
      try { capture('docker', ['exec', names[0], 'pg_isready', '-U', 'postgres', '-d', 'didar_qa']); break }
      catch (error) { if (n === 59) throw error; await new Promise(resolve => setTimeout(resolve, 500)) }
    }
    const apiPort = await freePort()
    let webPort
    do { webPort = await freePort() } while (webPort === apiPort)
    const apiOrigin = `http://127.0.0.1:${apiPort}`, webOrigin = `http://127.0.0.1:${webPort}`
    const env = {
      ...process.env, NODE_ENV: 'development', DIDAR_ENVIRONMENT: 'local', DIDAR_PAYMENT_MODE: 'sandbox', DIDAR_SEED_DEMO: 'true',
      DATABASE_URL: `postgres://postgres@127.0.0.1:${pgPort}/didar_qa`, REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      JWT_SECRET: randomBytes(32).toString('hex'), COOKIE_SECRET: randomBytes(32).toString('hex'),
      STORE_CORS: webOrigin, ADMIN_CORS: apiOrigin, VENDOR_CORS: apiOrigin, AUTH_CORS: `${webOrigin},${apiOrigin}`,
      FILE_BACKEND_URL: `${apiOrigin}/static`, MERCUR_BACKEND_URL: 'http://localhost:9000', MEDUSA_BACKEND_URL: apiOrigin,
      TEST_API_URL: apiOrigin, TEST_STOREFRONT_URL: webOrigin, MERCUR_DISABLE_TELEMETRY: 'true', NEXT_TELEMETRY_DISABLED: '1',
    }
    console.log('Disposable local QA database/services created. Persistent UAT volumes and configuration are not used.')
    await run('bun', ['run', 'db:setup'], { env })
    if (reuseBuild) console.log('Reusing production build: source, complete output and platform receipt verified.')
    else {
      await run('bun', ['run', 'build:all'], { env: { ...env, NODE_ENV: 'production' } })
      recordBuild()
    }
    processes.start('node', [resolve('packages/api/node_modules/@medusajs/cli/cli.js'), 'start', '--host', '127.0.0.1', '--port', String(apiPort)], {
      cwd: resolve('packages/api/.medusa/server'), env: { ...env, NODE_ENV: 'production' }, stdio: ['ignore', apiFD, apiFD],
    })
    await waitHTTP(`${apiOrigin}/health`, async r => await r.text() === 'OK')
    // next start serves the tested production build, with runtime proxy destination supplied above.
    processes.start('bun', ['run', '--cwd', 'apps/storefront', 'start', '--hostname', '127.0.0.1', '--port', String(webPort)], {
      env: { ...env, NODE_ENV: 'production' }, stdio: ['ignore', webFD, webFD],
    })
    await waitHTTP(`${webOrigin}/api/didar/catalog`, async r => { const d = await r.json(); return Array.isArray(d.products) && !!d.rate })
    await run('bun', ['test', './tests/local-workflow.test.ts', ...backendFiles], { env })
    await run('bun', ['run', '--cwd', 'packages/api', 'test:integration:http'], { env })
    await run('bun', ['run', 'test:e2e'], { env })
    console.log('Cloud/local automated verification passed. MAC_UAT_PENDING until the owner completes native Mac acceptance. RFID hardware remains unverified.')
  } finally {
    await cleanup()
    closeSync(apiFD); closeSync(webFD)
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(signal, onSignal)
  }
}
