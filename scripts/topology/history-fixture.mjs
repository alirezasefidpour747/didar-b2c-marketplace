// Runs INSIDE the fresh API image. Canonical sandbox workflows only; no SQL grants/history injection.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), { signNetwork } = require('../../packages/auth-network/index.cjs')
assert.equal(process.env.DIDAR_DISPOSABLE_QA, 'true'); assert.equal(process.env.DIDAR_PAYMENT_MODE, 'sandbox')
assert.equal(process.env.DIDAR_ENVIRONMENT, 'local'); assert.equal(process.env.DIDAR_AUTH_PROXY_POLICY, 'require-proof')
const original = globalThis.fetch
// Fixture provisioning uses a real loopback socket with v1 proof. The separate
// public acceptance matrix exercises the real Nginx original-socket path.
globalThis.fetch = (input, options = {}) => {
 const url = new URL(String(input)); const headers = new Headers(options.headers)
 if (['/didar/login', '/didar/register'].includes(url.pathname)) headers.set('x-didar-auth-network', signNetwork({ key: process.env.DIDAR_AUTH_NETWORK_KEY, peer: '127.0.0.1', method: options.method || 'GET', path: url.pathname + url.search, body: Buffer.from(options.body || '') }))
 return original(input, { ...options, headers })
}
process.env.TEST_API_URL = 'http://127.0.0.1:9000'
const { financeFixture, finDB } = await import('../../tests/financial-helpers.ts')
try {
 const f = await financeFixture(), result = await f.buy()
 assert.ok(result.item.uid); assert.ok(result.order.id); assert.ok(result.sale.id)
 const counts = {}
 for (const name of ['didar_inventory_item', 'didar_order', 'didar_order_line', 'didar_payment_attempt', 'didar_fin_event', 'didar_fin_posting']) {
  counts[name] = (await finDB.query('SELECT count(*)::int n FROM ' + name)).rows[0].n; assert.ok(counts[name] > 0, 'Populated preservation prerequisite: ' + name)
 }
 console.log(JSON.stringify({ status: 'PASS', scope: 'Disposable canonical sandbox history only, not owner data or live payment', counts, individual_uid_present: true, paid_order_and_financial_event_present: true, synthetic_direct_database_inserts: false }))
} finally { await finDB.end(); globalThis.fetch = original }
