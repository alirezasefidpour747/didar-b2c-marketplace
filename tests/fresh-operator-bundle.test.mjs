import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, access, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { sha256, bundleFiles } from '../scripts/deployment/nginx/stack.mjs'
import { assembleFreshAmendment, applicationSource, applicationImages, amendmentFiles } from '../scripts/ci/fresh-operator-bundle.mjs'

const root = resolve(import.meta.dirname, '..')
async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'didar-fresh-amendment-unit-'))
  try {
    const original = join(directory, 'original'); await mkdir(original)
    const manifest = { format: 1, kind: 'didar-nginx-verified-topology', source_sha: applicationSource,
      platform: 'linux/amd64', files: {}, images: Object.fromEntries(['api', 'storefront', 'postgres', 'redis'].map((role, i) => [role, { reference: applicationImages[role] || 'sha256:' + String(i).repeat(64), image_id: applicationImages[role] || 'sha256:' + String(i).repeat(64) }])),
      artifact_verification: { path: 'unit-artifact-not-real-evidence.json' }, independent_review: { path: 'unit-review-not-real-approval.json' } }
    for (const name of bundleFiles) {
      const bytes = await readFile(join(root, 'scripts/deployment/nginx', name))
      await writeFile(join(original, name), bytes); manifest.files[name] = sha256(bytes)
    }
    // Synthetic unit inputs only: never retained as delivery/target approval.
    const save = async () => {
      for (const [key, status] of [['artifact_verification', 'PASS'], ['independent_review', 'APPROVED']]) {
        const bytes = Buffer.from(JSON.stringify({ status, source_sha: manifest.source_sha,
          topology: 'nginx-verified-relay-v1', workspace_mounts: false, source_overlays: false,
          exit_code: 0, images: { api: manifest.images.api.image_id, storefront: manifest.images.storefront.image_id } }))
        await writeFile(join(original, manifest[key].path), bytes)
        manifest[key].sha256 = sha256(bytes); manifest.files[manifest[key].path] = sha256(bytes)
      }
      const bytes = Buffer.from(JSON.stringify(manifest)); await writeFile(join(original, 'operator-manifest.json'), bytes); return sha256(bytes)
    }
    await callback({ directory, original, manifest, save })
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('fresh amendment preserves original app source/images/receipts, hashes new code and creates no approval', () => fixture(async ({ directory, original, manifest, save }) => {
  const oldHash = await save(), oldStack = await readFile(join(original, 'stack.mjs'))
  const result = await assembleFreshAmendment(original, oldHash, 'f'.repeat(40), join(directory, 'candidate'))
  assert.equal(result.status, 'CANDIDATE_REQUIRES_CHIEF_ARCHITECT_ACCEPTANCE')
  assert.equal(result.approval_generated, false); assert.equal(result.target_config, 'BLOCKED')
  assert.equal(sha256(await readFile(join(original, 'operator-manifest.json'))), oldHash)
  assert.deepEqual(await readFile(join(original, 'stack.mjs')), oldStack)
  const next = JSON.parse(await readFile(join(directory, 'candidate/operator-manifest.json')))
  assert.equal(next.source_sha, applicationSource); assert.deepEqual(next.images, manifest.images)
  assert.equal(sha256(await readFile(join(directory, 'candidate/accepted-operator-manifest.json'))), oldHash)
  for (const [name, path] of Object.entries(amendmentFiles)) assert.equal(next.files[name], sha256(await readFile(join(root, path))))
  const amendment = JSON.parse(await readFile(join(directory, 'candidate/INSTALLATION_AMENDMENT.json')))
  assert.equal(amendment.original_application_release_modified, false)
  assert.equal(amendment.candidate_approval_receipt_generated, false)
  assert.equal(amendment.installation_source_sha, 'f'.repeat(40))
  const pending = JSON.parse(await readFile(join(directory, 'candidate/fresh-approval.template.json')))
  assert.equal(pending.status, 'PENDING'); assert.equal(pending.domain_cutover_authorized, false)
  for (const role of ['api', 'storefront']) assert.equal(pending.images[role], applicationImages[role])
}))

test('wrong original digest, another application source/image, stacked amendments and existing output fail closed', () => fixture(async ({ directory, original, manifest, save }) => {
  let digest = await save()
  await assert.rejects(assembleFreshAmendment(original, 'f'.repeat(64), 'f'.repeat(40), join(directory, 'bad-digest')), /MANIFEST_HASH/)
  await assert.rejects(access(join(directory, 'bad-digest')))
  manifest.source_sha = 'b'.repeat(40); digest = await save()
  await assert.rejects(assembleFreshAmendment(original, digest, 'f'.repeat(40), join(directory, 'bad-source')), /Accepted application source/)
  manifest.source_sha = applicationSource; manifest.images.api = { reference: 'sha256:' + 'a'.repeat(64), image_id: 'sha256:' + 'a'.repeat(64) }; digest = await save()
  await assert.rejects(assembleFreshAmendment(original, digest, 'f'.repeat(40), join(directory, 'bad-image')), /Accepted application image/)
  manifest.images.api = { reference: applicationImages.api, image_id: applicationImages.api }
  await writeFile(join(original, 'fresh.mjs'), 'not an accepted original kit'); manifest.files['fresh.mjs'] = sha256('not an accepted original kit'); digest = await save()
  await assert.rejects(assembleFreshAmendment(original, digest, 'f'.repeat(40), join(directory, 'stacked')), /Do not stack/)
  delete manifest.files['fresh.mjs']; digest = await save()
  const existing = join(directory, 'existing'); await mkdir(existing); await writeFile(join(existing, 'marker'), 'preserve')
  await assert.rejects(assembleFreshAmendment(original, digest, 'f'.repeat(40), existing), /EEXIST/)
  assert.equal(await readFile(join(existing, 'marker'), 'utf8'), 'preserve')
}))

test('private runtime provisioner refuses writable parent before any download or overwrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'didar-node-provision-unit-'))
  try {
    await chmod(directory, 0o777)
    const child = spawnSync('bash', [join(root, 'scripts/deployment/nginx/provision-node.sh'), join(directory, 'must-not-exist')], { encoding: 'utf8', timeout: 5000 })
    assert.equal(child.status, 2); assert.equal(child.signal, null)
    assert.match(child.stderr, /CANONICAL_PRIVATE_0700_PARENT_REQUIRED/)
    await assert.rejects(access(join(directory, 'must-not-exist')))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
