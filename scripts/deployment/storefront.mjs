// PID 1 entrypoint for the packaged storefront. Children never detach.
import './verify-package.mjs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { requireKey, exactPeers } from '@didar/auth-network'
const root = resolve(import.meta.dirname, '..')
requireKey(process.env.DIDAR_AUTH_NETWORK_KEY)
const privatePort = Number(process.env.DIDAR_PRIVATE_NEXT_PORT || 3001)
const publicPort = Number(process.env.DIDAR_AUTH_INGRESS_PORT || 3000)
if (![privatePort, publicPort].every(p => Number.isInteger(p) && p > 0 && p < 65536) || privatePort === publicPort) throw Error('Invalid public/private ports')
const ingressHost = process.env.DIDAR_AUTH_INGRESS_HOST || '127.0.0.1'
const ingressMode = process.env.DIDAR_AUTH_INGRESS_MODE ?? 'socket'
if (!['socket', 'verified-relay'].includes(ingressMode)) throw Error('INVALID_AUTH_INGRESS_MODE')
exactPeers(process.env.DIDAR_AUTH_INGRESS_PEERS, ingressMode === 'verified-relay')
const cert = process.env.DIDAR_AUTH_INGRESS_TLS_CERT_FILE, key = process.env.DIDAR_AUTH_INGRESS_TLS_KEY_FILE
if (!!cert !== !!key || (ingressMode === 'verified-relay' && !cert) || (!['127.0.0.1', '::1', 'localhost'].includes(ingressHost) && !cert)) throw Error('TLS_REQUIRED_FOR_PUBLIC_AUTH_INGRESS')
if (cert) { readFileSync(cert); readFileSync(key) }
const upstream = `http://127.0.0.1:${privatePort}`
if (process.env.DIDAR_AUTH_STOREFRONT_URL && process.env.DIDAR_AUTH_STOREFRONT_URL !== upstream) throw Error('Packaged Next must be the private loopback upstream')
const children = [], emit = data => console.log(JSON.stringify({ at: new Date().toISOString(), ...data }))
let stopping = false, failure = false
const exited = child => child.exitCode !== null || child.signalCode !== null
async function stop(reason, failed = false) {
  if (stopping) return
  stopping = true; failure ||= failed
  emit({ stage: 'shutdown', reason, failure })
  // Stop new ingress requests before stopping Next; only owned child PIDs.
  for (const item of [...children].reverse()) {
    if (!exited(item.child)) item.child.kill('SIGTERM')
    let timer
    await Promise.race([item.done, new Promise(r => { timer = setTimeout(r, 10000) })]); clearTimeout(timer)
    if (!exited(item.child)) { failure = true; item.child.kill('SIGKILL'); await item.done }
  }
  process.exitCode = failure ? 1 : 0
}
function start(stage, file, env) {
  const child = spawn(process.execPath, [file], { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] })
  let complete
  const item = { stage, child, done: new Promise(r => { complete = r }) }; children.push(item)
  emit({ stage, event: 'started', pid: child.pid })
  child.once('error', () => { failure = true; emit({ stage, event: 'spawn-error' }); complete(); void stop('child-spawn-error', true) })
  child.once('close', (code, signal) => { emit({ stage, event: 'closed', code, signal }); complete(); if (!stopping) void stop('unexpected-child-exit', true) })
  return item
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void stop(signal))
const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }
start('private-next', resolve(root, 'apps/storefront/server.js'), { ...env, HOSTNAME: '127.0.0.1', PORT: String(privatePort) })
let ready = false
for (let i = 0; i < 120 && !stopping; i++) {
  try { const r = await fetch(upstream + '/', { signal: AbortSignal.timeout(1000) }); await r.arrayBuffer(); if (r.status < 500) { ready = true; break } } catch {}
  await delay(250)
}
if (!ready) await stop('private-next-readiness-timeout', true)
else if (!stopping) start('auth-ingress', resolve(root, 'apps/storefront/auth-ingress.mjs'), { ...env, DIDAR_AUTH_STOREFRONT_URL: upstream, DIDAR_AUTH_INGRESS_HOST: ingressHost, DIDAR_AUTH_INGRESS_PORT: String(publicPort) })
