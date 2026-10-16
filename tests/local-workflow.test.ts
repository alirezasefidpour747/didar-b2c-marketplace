import { test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, connect } from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { ensureLocalConfig, readLocalConfig, validateLocal, freePort, assertLocalDocker, run } from '../scripts/local/runtime.mjs'
import { browserLaunchOptions } from '../scripts/local/browser-options.mjs'
import { recordBuild, verifyBuild } from '../scripts/local/build-receipt.mjs'
import { ownedDevCommand } from '../scripts/local/session.mjs'
import { dockerDatabaseRelay, relayProgram } from '../scripts/local/docker-relay.mjs'
const valid = {
  DIDAR_ENVIRONMENT: 'local', DIDAR_PAYMENT_MODE: 'sandbox', DIDAR_SEED_DEMO: 'true',
  DATABASE_URL: 'postgres://postgres@localhost:5432/didar', REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_SECRET: 'a'.repeat(64), COOKIE_SECRET: 'b'.repeat(64),
  STORE_CORS: 'http://localhost:3000', ADMIN_CORS: 'http://localhost:9000', VENDOR_CORS: 'http://localhost:7001', AUTH_CORS: 'http://127.0.0.1:9000',
}
function fixture(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'didar-local-config-'))
  mkdirSync(join(root, 'packages/api'), { recursive: true }); mkdirSync(join(root, 'apps/storefront'), { recursive: true })
  try { fn(root) } finally { rmSync(root, { recursive: true, force: true }) }
}
test('local setup is repeatable, creates private configuration and preserves passwords byte-for-byte', () => fixture(root => {
  const config = ensureLocalConfig(root, {})
  expect(config.DIDAR_ENVIRONMENT).toBe('local'); expect(config.DIDAR_PAYMENT_MODE).toBe('sandbox')
  const api = join(root, 'packages/api/.env'), web = join(root, 'apps/storefront/.env.local')
  const before = [readFileSync(api, 'utf8'), readFileSync(web, 'utf8')]
  ensureLocalConfig(root, {})
  expect([readFileSync(api, 'utf8'), readFileSync(web, 'utf8')]).toEqual(before)
  expect(statSync(api).mode & 0o777).toBe(0o600)
  expect(config.JWT_SECRET).not.toBe(config.COOKIE_SECRET)
}))
test('only a demonstrated local legacy sandbox can gain the missing environment flag', () => fixture(root => {
  const api = join(root, 'packages/api/.env')
  const old = Object.entries(valid).filter(([key]) => key !== 'DIDAR_ENVIRONMENT').map(([k,v]) => `${k}=${v}`).join('\n')
  writeFileSync(api, old)
  ensureLocalConfig(root, {})
  expect(readFileSync(api, 'utf8')).toBe(old + '\nDIDAR_ENVIRONMENT=local\n')
}))
for (const environment of ['staging', 'production', '']) test(`local tooling rejects ${environment || 'missing'} environment`, () => {
  expect(() => validateLocal({ ...valid, DIDAR_ENVIRONMENT: environment })).toThrow('DIDAR_ENVIRONMENT')
})
for (const [key, value] of [
  ['DATABASE_URL', 'postgres://user:private-value@db.example.test/didar'],
  ['REDIS_URL', 'redis://cache.example.test:6379'],
  ['STORE_CORS', 'https://remote.example.test'],
  ['DIDAR_PAYMENT_MODE', 'live'],
  ['DIDAR_SEED_DEMO', ''],
  ['JWT_SECRET', 'short'],
]) test(`local boundary rejects unsafe ${key} without disclosing the value`, () => {
  try { validateLocal({ ...valid, [key]: value }); throw new Error('should reject') }
  catch (error: any) { expect(error.message).toContain(key); if (value) expect(error.message).not.toContain(value) }
})
test('unsafe existing config is preserved and a frontend destination mismatch is refused', () => fixture(root => {
  const api = join(root, 'packages/api/.env')
  const contents = Object.entries({ ...valid, DIDAR_ENVIRONMENT: 'staging' }).map(([k,v]) => `${k}=${v}`).join('\n')
  writeFileSync(api, contents)
  expect(() => ensureLocalConfig(root, {})).toThrow('DIDAR_ENVIRONMENT')
  expect(readFileSync(api, 'utf8')).toBe(contents)
  writeFileSync(api, Object.entries(valid).map(([k,v]) => `${k}=${v}`).join('\n'))
  writeFileSync(join(root, 'apps/storefront/.env.local'), 'MEDUSA_BACKEND_URL=http://localhost:19000\n')
  expect(() => readLocalConfig(root, {})).toThrow('port 9000')
}))
test('injected staging/remote credentials fail the guard even when the local file is safe', () => fixture(root => {
  ensureLocalConfig(root, {})
  expect(() => readLocalConfig(root, { DIDAR_ENVIRONMENT: 'staging' })).toThrow('DIDAR_ENVIRONMENT')
  expect(() => readLocalConfig(root, { DATABASE_URL: 'postgres://secret@remote.invalid/db' })).toThrow('DATABASE_URL')
}))
test('Playwright uses its platform browser, honors an explicit executable and requires sandbox opt-out', () => {
  expect(browserLaunchOptions({})).toEqual({})
  expect(browserLaunchOptions({ CHROMIUM_PATH: '/Applications/Chromium.app/Contents/MacOS/Chromium' })).toEqual({ executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium' })
  expect(browserLaunchOptions({ PLAYWRIGHT_NO_SANDBOX: '1', CHROMIUM_PATH: '/usr/bin/chromium' })).toEqual({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
  expect(browserLaunchOptions({ PLAYWRIGHT_NO_SANDBOX: '0' })).toEqual({})
})
test('preflight refuses an occupied port without terminating its owner', async () => {
  const server = createServer().listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  try { await expect(freePort((server.address() as any).port)).rejects.toThrow('occupied'); expect(server.listening).toBe(true) }
  finally { await new Promise(resolve => server.close(resolve)) }
})
test('Docker exec relay carries simultaneous binary TCP streams over loopback, with no bridge address', async () => {
  const echo = createServer(socket => socket.pipe(socket)).listen(0, '127.0.0.1')
  await new Promise(resolve => echo.once('listening', resolve))
  const port = (echo.address() as any).port
  const relay = await dockerDatabaseRelay('a'.repeat(64), new URL('postgres://postgres@postgres:5432/didar'), () =>
    spawn(process.execPath, ['-e', relayProgram, '127.0.0.1', String(port)], { stdio: ['pipe', 'pipe', 'ignore'] }))
  try {
    await Promise.all([1,2,3].map(n => new Promise<void>((resolve, reject) => {
      const payload = Buffer.alloc(32768, n), chunks: Buffer[] = []
      const socket = connect(relay.port, '127.0.0.1', () => socket.write(payload))
      socket.setTimeout(10000, () => socket.destroy(new Error('Relay timeout')))
      socket.on('error', reject)
      socket.on('data', chunk => { chunks.push(chunk); if (Buffer.concat(chunks).length === payload.length) { expect(Buffer.concat(chunks)).toEqual(payload); socket.destroy(); resolve() } })
    })))
  } finally { await relay.close(); await new Promise(resolve => echo.close(resolve)) }
})

test('remote Docker TCP/SSH targets are refused before any daemon access', () => {
  const old = process.env.DOCKER_HOST
  try {
    for (const target of ['tcp://127.0.0.1:2375', 'ssh://staging.example.test', 'tcp://remote.invalid:2376']) {
      process.env.DOCKER_HOST = target
      expect(() => assertLocalDocker()).toThrow('Refusing remote DOCKER_HOST')
    }
  } finally { if (old === undefined) delete process.env.DOCKER_HOST; else process.env.DOCKER_HOST = old }
})
test('failed child verification preserves the nonzero result', async () => {
  await expect(run('node', ['-e', 'process.exit(7)'])).rejects.toThrow('exited 7')
})
test('locked native compiler/image artifacts include Intel and Apple Silicon Mac variants', () => {
  const lock = readFileSync('bun.lock', 'utf8')
  for (const arch of ['arm64', 'x64'])
    for (const name of ['@esbuild/darwin-', '@swc/core-darwin-', '@next/swc-darwin-', '@img/sharp-darwin-', '@img/sharp-libvips-darwin-'])
      expect(lock).toContain(`"${name}${arch}":`)
})

test('an explicitly blank environment flag is preserved and never relabeled local', () => fixture(root => {
  const api = join(root, 'packages/api/.env')
  const contents = Object.entries({ ...valid, DIDAR_ENVIRONMENT: '' }).map(([k,v]) => `${k}=${v}`).join('\n')
  writeFileSync(api, contents)
  expect(() => ensureLocalConfig(root, {})).toThrow('DIDAR_ENVIRONMENT')
  expect(readFileSync(api, 'utf8')).toBe(contents)
}))

test('local stop recognizes only the native dev wrapper, never unrelated or test processes', () => {
  expect(ownedDevCommand('node scripts/local.mjs dev')).toBe(true)
  expect(ownedDevCommand('/opt/homebrew/bin/node /Users/owner/didar/scripts/local.mjs dev')).toBe(true)
  for (const command of ['sleep 100', 'node scripts/local.mjs test', 'node scripts/local.mjs setup', 'python scripts/local.mjs dev', 'node scripts/other.mjs dev', 'node scripts/local.mjs dev --other'])
    expect(ownedDevCommand(command)).toBe(false)
})

test('build reuse refuses changed source, damaged artifacts, another platform or a missing receipt', () => fixture(root => {
  const paths = ['packages/api/.medusa/server/medusa-config.js', 'apps/storefront/.next/BUILD_ID', 'apps/admin/dist/index.html', 'apps/vendor/dist/index.html']
  for (const path of paths) { const full = join(root, path); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, 'verified output') }
  writeFileSync(join(root, 'input.ts'), 'verified source')
  recordBuild(root, ['input.ts']); expect(() => verifyBuild(root, ['input.ts'])).not.toThrow()
  writeFileSync(join(root, 'input.ts'), 'changed source'); expect(() => verifyBuild(root, ['input.ts'])).toThrow('source/artifacts/platform')
  writeFileSync(join(root, 'input.ts'), 'verified source'); writeFileSync(join(root, paths[0]), 'damaged output')
  expect(() => verifyBuild(root, ['input.ts'])).toThrow('source/artifacts/platform')
  writeFileSync(join(root, paths[0]), 'verified output')
  const path = join(root, '.local/build-receipt.json'), receipt = JSON.parse(readFileSync(path, 'utf8'))
  writeFileSync(path, JSON.stringify({ ...receipt, platform: 'another-platform' })); expect(() => verifyBuild(root, ['input.ts'])).toThrow('source/artifacts/platform')
  rmSync(path); expect(() => verifyBuild(root, ['input.ts'])).toThrow('receipt missing')
}))


test('build receipt accepts a tracked route removal and still detects a newly added replacement route', () => fixture(root => {
  const git = (...args: string[]) => { const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});expect(r.status,r.stderr).toBe(0) }
  git('init','-q')
  const outputs=['packages/api/.medusa/server/medusa-config.js','apps/storefront/.next/BUILD_ID','apps/admin/dist/index.html','apps/vendor/dist/index.html']
  for(const path of outputs){mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),'compiled output')}
  const old='apps/storefront/src/app/products/old.tsx', replacement='apps/storefront/src/app/products/new.tsx'
  mkdirSync(join(root,old,'..'),{recursive:true});writeFileSync(join(root,old),'old route');git('add',old)
  rmSync(join(root,old));writeFileSync(join(root,replacement),'new route')
  recordBuild(root);expect(()=>verifyBuild(root)).not.toThrow()
  writeFileSync(join(root,replacement),'changed replacement');expect(()=>verifyBuild(root)).toThrow('source/artifacts/platform')
}))
