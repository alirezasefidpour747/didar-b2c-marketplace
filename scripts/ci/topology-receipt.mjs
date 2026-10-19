import assert from 'node:assert/strict'
export const requiredCategories = ['application', 'browser', 'origin', 'media', 'history', 'independent', 'lifecycle', 'force_recreate']
export function validateTopologyReceipt(m, r) {
  assert.equal(r.status, 'PASS'); assert.equal(r.source_sha, m.source_sha)
  assert.deepEqual(r.image_ids, Object.fromEntries(Object.entries(m.images).map(([k,v]) => [k, v.id])))
  assert.equal(r.archive_sha256, m.archive_sha256); assert.equal(r.kit_sha256, m.install_kit.sha256)
  assert.equal(r.no_application_overlays, true); assert.equal(r.clean_app_image_environment, true)
  assert.deepEqual(Object.keys(r.categories).sort(), [...requiredCategories].sort())
  for (const code of Object.values(r.categories)) assert.equal(code, 0)
  assert.equal(r.process.code, 0); assert.equal(r.process.signal, null); assert.equal(r.process.spawn_error, null)
  assert.match(r.evidence_sha256, /^[a-f0-9]{64}$/); assert.match(r.packaging_sha256, /^[a-f0-9]{64}$/)
  return r
}
