import { capture, freePort, readLocalConfig } from './runtime.mjs'

export function validateDataConfiguration(env) {
  const database = new URL(env.DATABASE_URL), redis = new URL(env.REDIS_URL)
  if (database.username !== 'postgres' || database.password || database.pathname !== '/didar' || (database.port || '5432') !== '5432' || (redis.port || '6379') !== '6379' || redis.username || redis.password || redis.search || redis.hash || !['', '/0', '/'].includes(redis.pathname))
    throw new Error('Local data helper expects the documented disposable postgres/didar and Redis defaults. Existing custom configuration is preserved; use its matching services manually.')
}
export async function startDataServices() {
  validateDataConfiguration(readLocalConfig())
  for (const spec of [
    { name: 'didar-postgres', image: 'postgres:17-alpine', port: 5432, args: ['-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=didar', '-v', 'didar-local-postgres:/var/lib/postgresql/data'] },
    { name: 'didar-redis', image: 'redis:7-alpine', port: 6379, args: [] },
  ]) {
    const found = capture('docker', ['container', 'ls', '-aq', '--filter', `name=^/${spec.name}$`])
    if (found) {
      const state = JSON.parse(capture('docker', ['inspect', found]))[0]
      const bindings = state.HostConfig.PortBindings?.[`${spec.port}/tcp`]
      if (state.Config.Image !== spec.image || !bindings?.length || bindings.some(b => b.HostIp !== '127.0.0.1' || b.HostPort !== String(spec.port)))
        throw new Error(`Existing ${spec.name} has unexpected image/port bindings; preserved without changes`)
      // Existing anonymous or named PostgreSQL volumes are deliberately retained.
      if (!state.State.Running) { await freePort(spec.port); capture('docker', ['start', spec.name]) }
    } else {
      await freePort(spec.port)
      capture('docker', ['run', '-d', '--name', spec.name, '-p', `127.0.0.1:${spec.port}:${spec.port}`, ...spec.args, spec.image])
    }
  }
  for (let i = 0; i < 60; i++) {
    try {
      capture('docker', ['exec', 'didar-postgres', 'pg_isready', '-U', 'postgres', '-d', 'didar'])
      if (capture('docker', ['exec', 'didar-redis', 'redis-cli', 'ping']) === 'PONG') return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Local PostgreSQL/Redis did not become ready; existing data was preserved')
}
