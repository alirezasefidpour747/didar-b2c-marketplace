import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateTopologyReceipt, requiredCategories } from '../scripts/ci/verify-topology-images.mjs'
import { requirePublishableBundle } from '../scripts/ci/release.mjs'
const m = { source_sha: 'a'.repeat(40), delivery_kind: 'ACCEPTED_MAIN_RELEASE', images: { api: { id: 'sha256:' + 'b'.repeat(64) }, storefront: { id: 'sha256:' + 'c'.repeat(64) } }, archive_sha256: 'd'.repeat(64), install_kit: { sha256: 'e'.repeat(64) } }
const receipt = () => ({ status: 'PASS', source_sha: m.source_sha, image_ids: { api: m.images.api.id, storefront: m.images.storefront.id }, archive_sha256: m.archive_sha256, kit_sha256: m.install_kit.sha256, no_application_overlays: true, clean_app_image_environment: true, categories: Object.fromEntries(requiredCategories.map(k => [k, 0])), process: { code: 0, signal: null, spawn_error: null }, evidence_sha256: 'f'.repeat(64), packaging_sha256: '1'.repeat(64) })
test('artifact acceptance binds both immutable images, source, archive, kit and all actual outcomes', () => {
  assert.doesNotThrow(() => validateTopologyReceipt(m, receipt()))
  for (const change of [r => {r.source_sha = '0'.repeat(40)}, r => {r.image_ids.api = m.images.storefront.id}, r => {r.archive_sha256 = '0'.repeat(64)}, r => {r.kit_sha256 = '0'.repeat(64)}, r => {r.no_application_overlays = false}, r => {r.clean_app_image_environment = false}, r => {delete r.categories.media}, r => {r.categories.force_recreate = 1}, r => {r.process.code = null}, r => {r.process.signal = 'SIGTERM'}, r => {r.process.spawn_error = 'ENOENT'}, r => {r.packaging_sha256 = 'summary says PASS'}]) { const r = receipt(); change(r); assert.throws(() => validateTopologyReceipt(m, r)) }
})
test('candidate/unknown-kind/legacy success cannot publish the signed topology', () => {
  const value = { ...m, verification: { independent_artifacts: receipt() } }
  assert.doesNotThrow(() => requirePublishableBundle(value))
  for (const delivery_kind of ['REVIEW_CANDIDATE', 'UNKNOWN', undefined]) assert.throws(() => requirePublishableBundle({ ...value, delivery_kind }))
  assert.throws(() => requirePublishableBundle({ ...value, verification: { independent_artifacts: { status: 'PASS' } } }))
})
test('packaged runner rejects source overlays before reaching Docker', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'didar-r5-input-'))
  try {
    for (const extra of [{ portable_frontend: '/workspace/old' }, { api_patch_files: [] }]) {
      const file = join(dir, 'input.json'); await writeFile(file, JSON.stringify({ source_sha: m.source_sha, packaged_images: true, api_image: 'dummy', frontend_base_image: 'dummy', postgres_image: 'dummy', redis_image: 'dummy', nginx_image: 'dummy', repository: resolve('.'), output_dir: join(dir, 'out'), ...extra }))
      const child = spawnSync(process.execPath, ['scripts/topology/stack.mjs', file], { encoding: 'utf8', env: { ...process.env, PATH: '/does-not-exist' } })
      assert.equal(child.status, 1); assert.equal(child.signal, null); assert.match(child.stderr, /Packaged verification forbids application overlays/)
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})
