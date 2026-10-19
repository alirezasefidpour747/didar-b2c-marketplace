import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import handler from '../auth.mjs'
const shared = createRequire(import.meta.url)('../../../../packages/auth-network/index.cjs')
const key = 'test-only-key-0123456789abcdef0123456789'

test('njs detached empty requestBuffer is normalized without changing the v1 empty-body proof', () => {
  const backing = new ArrayBuffer(3), detached = Buffer.from(backing)
  structuredClone(backing, { transfer: [backing] })
  assert.equal(detached.length, 0)
  const previous = process.env.DIDAR_AUTH_NETWORK_KEY
  process.env.DIDAR_AUTH_NETWORK_KEY = key
  try {
    for (const body of [detached, Buffer.alloc(0), undefined, Buffer.from([0, 255, 128])]) {
      const r = { method: 'POST', headersIn: { 'Content-Length': String(body?.length || 0) }, requestBuffer: body,
        variables: { request_uri: '/didar/login?x=%2f&x=+', realip_remote_addr: '127.0.0.2', remote_addr: '127.0.0.2', proxy_protocol_addr: '', request_body_file: '' },
        return(status) { this.status = status }, internalRedirect(path) { this.redirect = path } }
      handler.authenticate(r)
      assert.equal(r.status, undefined)
      assert.equal(r.redirect, '@didar_signed_relay')
      const input = { key, method: 'POST', path: r.variables.request_uri, body: body?.length ? body : Buffer.alloc(0) }
      assert.equal(shared.verifyNetwork({ ...input, assertion: r.variables.didar_network_proof }).peer, '127.0.0.2')
      if (body?.length) assert.throws(() => shared.verifyNetwork({ ...input, body: Buffer.alloc(0), assertion: r.variables.didar_network_proof }))
    }
  } finally {
    if (previous === undefined) delete process.env.DIDAR_AUTH_NETWORK_KEY
    else process.env.DIDAR_AUTH_NETWORK_KEY = previous
  }
})
