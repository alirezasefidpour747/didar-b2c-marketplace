import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { parseEnv } from 'node:util'

export const loopback = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)
export function localURL(value, protocol, label) {
  let url
  try { url = new URL(value) } catch { throw new Error(`${label} is missing or invalid; values withheld`) }
  if (!protocol.includes(url.protocol) || !loopback(url.hostname))
    throw new Error(`${label} must use a loopback address; values withheld`)
  return url
}
export function validateLocal(env, { allowMissingEnvironment = false } = {}) {
  if (env.DIDAR_ENVIRONMENT !== 'local' && !(allowMissingEnvironment && !env.DIDAR_ENVIRONMENT))
    throw new Error('Refusing local tooling: DIDAR_ENVIRONMENT must explicitly be local')
  if (env.DIDAR_PAYMENT_MODE !== 'sandbox') throw new Error('Refusing local tooling: DIDAR_PAYMENT_MODE must be sandbox')
  if (!['true', 'false'].includes(env.DIDAR_SEED_DEMO)) throw new Error('DIDAR_SEED_DEMO must explicitly be true or false')
  localURL(env.DATABASE_URL, ['postgres:', 'postgresql:'], 'DATABASE_URL')
  localURL(env.REDIS_URL, ['redis:'], 'REDIS_URL')
  for (const key of ['STORE_CORS', 'ADMIN_CORS', 'VENDOR_CORS', 'AUTH_CORS']) {
    if (!env[key]) throw new Error(`${key} is required`)
    for (const origin of env[key].split(',')) localURL(origin.trim(), ['http:'], key)
  }
  for (const key of ['JWT_SECRET', 'COOKIE_SECRET'])
    if (!env[key] || env[key].length < 32) throw new Error(`${key} needs at least 32 characters; existing files were preserved`)
  return env
}
export function readLocalConfig(root = '.', inherited = process.env) {
  const api = `${root}/packages/api/.env`, web = `${root}/apps/storefront/.env.local`
  if (!existsSync(api) || !existsSync(web)) throw new Error('Local configuration missing. Run bun run local:setup')
  const env = validateLocal({ ...parseEnv(readFileSync(api, 'utf8')), ...inherited })
  const frontend = { ...parseEnv(readFileSync(web, 'utf8')), ...inherited }
  const origin = localURL(frontend.MEDUSA_BACKEND_URL, ['http:'], 'MEDUSA_BACKEND_URL')
  if ((origin.port || '80') !== '9000' || origin.pathname !== '/') throw new Error('Native local storefront must target the loopback API on port 9000')
  return { ...env, MEDUSA_BACKEND_URL: origin.origin }
}
export function ensureLocalConfig(root = '.', inherited = process.env) {
  const api = `${root}/packages/api/.env`, web = `${root}/apps/storefront/.env.local`
  if (!existsSync(api)) writeFileSync(api, `DIDAR_ENVIRONMENT=local\nDATABASE_URL=postgres://postgres@localhost:5432/didar\nREDIS_URL=redis://localhost:6379\nJWT_SECRET=${randomBytes(32).toString('hex')}\nCOOKIE_SECRET=${randomBytes(32).toString('hex')}\nSTORE_CORS=http://localhost:3000\nADMIN_CORS=http://localhost:9000,http://localhost:7000\nVENDOR_CORS=http://localhost:9000,http://localhost:7001\nAUTH_CORS=http://localhost:9000,http://localhost:7000,http://localhost:7001\nDIDAR_PAYMENT_MODE=sandbox\nDIDAR_SEED_DEMO=true\nMERCUR_DISABLE_TELEMETRY=true\n`, { mode: 0o600, flag: 'wx' })
  const contents = readFileSync(api, 'utf8'), parsed = parseEnv(contents)
  const hasEnvironment = Object.hasOwn(parsed, 'DIDAR_ENVIRONMENT')
  // Upgrade old demonstrably local sandbox files; never relabel a remote environment.
  validateLocal({ ...parsed, ...inherited }, { allowMissingEnvironment: !hasEnvironment })
  if (!hasEnvironment) appendFileSync(api, `${contents.endsWith('\n') ? '' : '\n'}DIDAR_ENVIRONMENT=local\n`)
  if (!existsSync(web)) writeFileSync(web, 'MEDUSA_BACKEND_URL=http://localhost:9000\n', { mode: 0o600, flag: 'wx' })
  return readLocalConfig(root, inherited)
}
export function capture(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...options })
  if (result.error || result.status !== 0) throw new Error(`${cmd} ${args[0] || ''} failed. Check the prerequisite/tool or Docker Desktop; output withheld to protect configuration`)
  return result.stdout.trim()
}
export function assertLocalDocker() {
  if (process.env.DOCKER_HOST && !/^(unix:|npipe:)/.test(process.env.DOCKER_HOST)) throw new Error('Refusing remote DOCKER_HOST: use local Docker Desktop/Engine')
  const context = JSON.parse(capture('docker', ['context', 'inspect']))[0]
  if (!/^(unix:|npipe:)/.test(context?.Endpoints?.docker?.Host || '')) throw new Error('Refusing remote Docker context: select local Docker Desktop/Engine')
}
export function prerequisites() {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node 24 for the verified local workflow')
  if (capture('bun', ['--version']) !== '1.4.3') throw new Error('Use the pinned Bun 1.4.3')
  capture('git', ['--version'])
  try {
    capture(process.env.FFPROBE_PATH || 'ffprobe', ['-version'])
    const encoders=capture(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner','-encoders'])
    if(!encoders.includes('libx264')) throw new Error('encoder')
  } catch { throw new Error('Phase 4 media needs FFmpeg/ffprobe with libx264. On macOS install brew install ffmpeg; see docs/PHASE4_VISUAL_CMS_IMPLEMENTATION.md') }
  assertLocalDocker()
  capture('docker', ['info', '--format', '{{.ServerVersion}}'])
  console.log(`Platform: ${process.platform}/${process.arch}${process.platform === 'darwin' && process.arch === 'arm64' ? ' (Apple Silicon)' : ''}; Node ${process.versions.node}; Bun 1.4.3; local Docker ready`)
}
export async function freePort(port = 0) {
  const server = createServer()
  await new Promise((resolve, reject) => server.once('error', () => reject(new Error(`Loopback port ${port} is occupied. Stop the conflicting server yourself; no process was killed.`))).listen(port, '127.0.0.1', resolve))
  const chosen = server.address().port
  await new Promise(resolve => server.close(resolve))
  return chosen
}
export async function run(cmd, args, options = {}) {
  const child = spawn(cmd, args, { stdio: 'inherit', detached: true, ...options })
  const stop = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch {} } }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, stop)
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)))
    })
  } finally { for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(signal, stop) }
}
export async function waitHTTP(url, validate, timeout = 300000, requestTimeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(requestTimeout) })
      if (r.ok && await validate(r)) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Readiness failed for ${url}; inspect the API/storefront logs`)
}
export function managedProcesses() {
  const children = []
  let closing = false
  function start(cmd, args, options = {}) {
    const child = spawn(cmd, args, { stdio: 'inherit', detached: true, ...options })
    child.once('error', () => {})
    children.push(child)
    return child
  }
  async function close() {
    if (closing) return
    closing = true
    for (const child of children) {
      if (!child.pid) continue
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
    }
    await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null || !child.pid ? undefined : new Promise(resolve => {
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} ; resolve() }, 8000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
    })))
  }
  return { start, close, children }
}
