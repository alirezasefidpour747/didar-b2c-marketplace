import { randomBytes } from 'node:crypto'
import { mkdirSync, openSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import { bootstrapAcceptance } from './bootstrap-acceptance.mjs'
import { recordBuild, verifyBuild } from './build-receipt.mjs'
import { capture, freePort, run, waitHTTP } from './runtime.mjs'

export const backendFiles = ['pricing', 'inventory', 'security', 'commerce', 'upgraded-commerce', 'phase1', 'migrations', 'finance', 'finance-procurement', 'finance-ledger', 'finance-tahesab', 'finance-integrated', 'uat-prepare', 'taxonomy-labels', 'facets', 'merchant-pricing', 'storefront', 'onboarding-media', 'content', 'native-panels', 'native-policy'].map(name => `./tests/${name}.test.ts`)
export async function testLocal(processes, { reuseBuild = false, noDemoOnly = false } = {}) {
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
      // Explicit random loopback port stays stable when this disposable container restarts.
      const publishedPort = await freePort()
      capture('docker', ['run', '-d', '--name', names[index], '--label', 'didar.disposable-qa=true', '-p', `127.0.0.1:${publishedPort}:${port}`, ...extra, image])
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
      ...process.env, DIDAR_DISPOSABLE_QA: 'true', NODE_ENV: 'development', DIDAR_ENVIRONMENT: 'local', DIDAR_PAYMENT_MODE: 'sandbox', DIDAR_SEED_DEMO: 'true',
      DATABASE_URL: `postgres://postgres@127.0.0.1:${pgPort}/didar_qa`, REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      JWT_SECRET: randomBytes(32).toString('hex'), COOKIE_SECRET: randomBytes(32).toString('hex'),
      STORE_CORS: webOrigin, ADMIN_CORS: apiOrigin, VENDOR_CORS: apiOrigin, AUTH_CORS: `${webOrigin},${apiOrigin}`,
      FILE_BACKEND_URL: `${apiOrigin}/static`, MERCUR_BACKEND_URL: 'same-origin', MEDUSA_BACKEND_URL: apiOrigin,
      // Synthetic origin attestation for disposable label tests only; never applied to owner configuration.
      DIDAR_PUBLIC_ORIGIN: 'https://shop.didar-gold.ir', DIDAR_PUBLIC_ORIGIN_VERIFIED: 'true',
      TEST_API_URL: apiOrigin, TEST_STOREFRONT_URL: webOrigin, MERCUR_DISABLE_TELEMETRY: 'true', NEXT_TELEMETRY_DISABLED: '1',
    }
    console.log('Disposable local QA database/services created. Persistent UAT volumes and configuration are not used.')
    await run('bun', ['run', 'db:setup'], { env: noDemoOnly ? { ...env, DIDAR_SEED_DEMO: 'false' } : env })
    if (noDemoOnly) {
      // A fresh no-demo database must receive the bridge tables without any
      // canonical/demo identity or commerce seed. This would catch the original
      // early-return installer defect, unlike replaying after a demo install.
      const sql = `SELECT json_build_object('actors',(SELECT count(*) FROM didar_native_actor),'sellers',(SELECT count(*) FROM didar_native_seller),'policies',(SELECT count(*) FROM didar_native_acl),'users',(SELECT count(*) FROM didar_user),'products',(SELECT count(*) FROM didar_product),'orders',(SELECT count(*) FROM didar_order));`
      const counts = JSON.parse(capture('docker', ['exec',names[0],'psql','-U','postgres','-d','didar_qa','-At','-c',sql]))
      if (Object.values(counts).some(count => count !== 0)) throw new Error('Fresh no-demo installer created identities or commerce')
      console.log('FRESH_NON_DEMO_INSTALL_VERIFIED ' + JSON.stringify(counts))
      Object.assign(env, {DIDAR_SEED_DEMO:'false', DIDAR_BOOTSTRAP_EMAIL:'first-admin@bootstrap.invalid', DIDAR_BOOTSTRAP_PASSWORD:randomBytes(20).toString('hex'), NATIVE_BOOTSTRAP_PASSWORD:randomBytes(20).toString('hex')})
      await run('bun',['run','--cwd','packages/api','medusa','exec','./src/scripts/provision-first-admin.ts'],{env})
      await run('bun',['run','--cwd','packages/api','medusa','exec','./src/scripts/didar-seed.ts'],{env})
    }
    if (!noDemoOnly) {
    // Upgrade path must apply native tables with demo/account creation disabled.
    await run('bun', ['run','--cwd','packages/api','medusa','exec','./src/scripts/didar-seed.ts'], { env: { ...env, DIDAR_SEED_DEMO: 'false' } })
    await run('bun', ['run','--cwd','packages/api','medusa','exec','./src/scripts/native-qa-seed.ts'], {env})
    }
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
    if(noDemoOnly) {
      await bootstrapAcceptance(env)
      const counts=JSON.parse(capture('docker',['exec',names[0],'psql','-U','postgres','-d','didar_qa','-At','-c',"SELECT json_build_object('admins',(SELECT count(*) FROM didar_user WHERE role='admin'),'bridges',(SELECT count(*) FROM didar_native_actor),'products',(SELECT count(*) FROM didar_product),'orders',(SELECT count(*) FROM didar_order),'demo',(SELECT count(*) FROM didar_user WHERE email LIKE '%@didar.test'))"]))
      if(counts.admins!==1 || counts.bridges!==1 || counts.products!==0 || counts.orders!==0 || counts.demo!==0) throw Error('No-demo bootstrap changed commerce or created demo identities')
      console.log('C09_REPEAT_MIGRATION_NO_DEMO_VERIFIED '+JSON.stringify(counts))
      return
    }
    await run('bun', ['test', './tests/local-workflow.test.ts', ...backendFiles], { env })
    await run('bun', ['run', '--cwd', 'packages/api', 'test:integration:http'], { env })
    await run('node', ['scripts/local/browser-login-window.mjs'], { env })
    await run('bun', ['run', 'test:e2e'], { env })
    console.log('CODEX_LINUX_VERIFIED. Owner Mac acceptance is deferred until all feature phases are complete; physical RFID hardware remains unverified.')
  } finally {
    await cleanup()
    closeSync(apiFD); closeSync(webFD)
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(signal, onSignal)
  }
}
