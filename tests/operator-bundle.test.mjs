import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assembleOperatorBundle } from '../scripts/ci/operator-bundle.mjs'
import { prepareInstallKit } from '../scripts/ci/install-kit.mjs'
import { requiredCategories } from '../scripts/ci/topology-receipt.mjs'
import { readBundle } from '../scripts/deployment/nginx/stack.mjs'
const hash = b => createHash('sha256').update(b).digest('hex')
test('verified kit assembles a consumable protected wrapper bundle; approval/archive tampering fail closed', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'didar-operator-'))
 try {
  const source = 'a'.repeat(40), ids = { api: 'sha256:' + 'b'.repeat(64), storefront: 'sha256:' + 'c'.repeat(64) }, kit = await prepareInstallKit(dir, source), archive = Buffer.from('synthetic unit archive, never Docker acceptance')
  await writeFile(join(dir, 'images.tar.gz'), archive)
  const receipt = { status: 'PASS', source_sha: source, image_ids: ids, archive_sha256: hash(archive), kit_sha256: kit.sha256, no_application_overlays: true, clean_app_image_environment: true, categories: Object.fromEntries(requiredCategories.map(k => [k, 0])), process: { code: 0, signal: null, spawn_error: null }, evidence_sha256: 'd'.repeat(64), packaging_sha256: 'e'.repeat(64) }
  const manifest = { source_sha: source, archive: 'images.tar.gz', images: Object.fromEntries(Object.entries(ids).map(([k,id]) => [k,{id}])), archive_sha256: hash(archive), install_kit: kit, verification: { independent_artifacts: receipt } }
  await writeFile(join(dir, 'release-manifest.json'), JSON.stringify(manifest))
  const review = { status: 'APPROVED', source_sha: source, topology: 'nginx-verified-relay-v1', workspace_mounts: false, source_overlays: false, exit_code: 0, images: ids, artifact_receipt_sha256: hash(Buffer.from(JSON.stringify(receipt))), reviewer: 'unit-fixture-only', evidence_url: 'https://example.invalid/unit-fixture' }, reviewPath = join(dir,'review.json'), depPath = join(dir,'deps.json')
  await writeFile(depPath, JSON.stringify(Object.fromEntries(['postgres','redis'].map(k => [k,{reference:'sha256:'+'f'.repeat(64),image_id:'sha256:'+'f'.repeat(64)}]))))
  await writeFile(reviewPath, JSON.stringify({...review,status:'PENDING'})); await assert.rejects(assembleOperatorBundle(dir, reviewPath, depPath, join(dir,'rejected')))
  await writeFile(reviewPath, JSON.stringify(review)); const out = join(dir,'operator'), result = await assembleOperatorBundle(dir,reviewPath,depPath,out)
  assert.equal(result.target_config,'BLOCKED'); assert.equal(result.installation_authorized,false)
  const actual = await readBundle(join(out,'operator-manifest.json'),result.manifest_sha256); assert.equal(actual.manifest.source_sha,source)
  await writeFile(join(dir,'images.tar.gz'),'tampered'); await assert.rejects(assembleOperatorBundle(dir,reviewPath,depPath,join(dir,'tampered')),/Delivered archive mismatch/)
 } finally { await rm(dir,{recursive:true,force:true}) }
})
