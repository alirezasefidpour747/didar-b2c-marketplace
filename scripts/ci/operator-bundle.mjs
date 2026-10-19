// Deterministic assembly after actual artifact acceptance and independent review.
// Never fabricates approval, target discovery, backup receipts or dependency IDs.
import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateTopologyReceipt } from './topology-receipt.mjs'
const hash = b => createHash('sha256').update(b).digest('hex')
export async function assembleOperatorBundle(artifactDir, reviewPath, dependenciesPath, output) {
  const m = JSON.parse(await readFile(join(artifactDir, 'release-manifest.json'))), receipt = validateTopologyReceipt(m, m.verification.independent_artifacts)
  assert.equal(m.archive, 'images.tar.gz'); const archiveHash = createHash('sha256'); for await (const bytes of createReadStream(join(artifactDir, m.archive))) archiveHash.update(bytes); assert.equal(archiveHash.digest('hex'), m.archive_sha256, 'Delivered archive mismatch')
  assert.equal(m.install_kit.manifest, 'install-kit/kit-manifest.json')
  const kitBytes = await readFile(join(artifactDir, m.install_kit.manifest)); assert.equal(hash(kitBytes), m.install_kit.sha256)
  const kit = JSON.parse(kitBytes); assert.equal(kit.source_sha, m.source_sha); assert.equal(kit.target_config, 'BLOCKED')
  for (const [name, digest] of Object.entries(kit.files)) { assert.ok(!name.startsWith('/') && !name.split('/').includes('..')); assert.equal(hash(await readFile(join(artifactDir, 'install-kit', name))), digest) }
  const review = JSON.parse(await readFile(reviewPath)), dependencies = JSON.parse(await readFile(dependenciesPath))
  const core = ['stack.mjs', 'compose.topology.json', 'auth.mjs', 'sign.mjs', 'render.mjs', 'nginx.conf.template', 'proxy-headers.conf', 'topology.env.template']
  const images = Object.fromEntries(['api', 'storefront'].map(role => [role, { reference: m.images[role].id, image_id: m.images[role].id }]))
  for (const role of ['postgres', 'redis']) {
    const image = dependencies[role]; assert.deepEqual(Object.keys(image).sort(), ['image_id', 'reference']); assert.match(image.reference, /^(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[a-f0-9]{64})$/); assert.match(image.image_id, /^sha256:[a-f0-9]{64}$/); images[role] = image
  }
  assert.equal(review.status, 'APPROVED'); assert.equal(review.source_sha, m.source_sha); assert.equal(review.topology, 'nginx-verified-relay-v1'); assert.equal(review.workspace_mounts, false); assert.equal(review.source_overlays, false); assert.equal(review.exit_code, 0)
  assert.deepEqual(review.images, receipt.image_ids); assert.equal(review.artifact_receipt_sha256, hash(Buffer.from(JSON.stringify(receipt))))
  assert.ok(review.reviewer && review.evidence_url, 'Independent reviewer identity and durable evidence URL required')
  const applicationReceipt = { status: 'PASS', source_sha: m.source_sha, topology: 'nginx-verified-relay-v1', workspace_mounts: false, source_overlays: false, exit_code: 0, images: receipt.image_ids, artifact_receipt: receipt }
  await mkdir(output, { recursive: false, mode: 0o700 })
  const files = {}
  for (const name of core) { const from = join(artifactDir, 'install-kit/scripts/deployment/nginx', name); assert.equal(hash(await readFile(from)), kit.files['scripts/deployment/nginx/' + name]); await copyFile(from, join(output, name)); files[name] = hash(await readFile(join(output, name))) }
  for (const [name, value] of [['artifact-verification.json', applicationReceipt], ['independent-review.json', review]]) { await writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n'); files[name] = hash(await readFile(join(output, name))) }
  const manifest = { format: 1, kind: 'didar-nginx-verified-topology', source_sha: m.source_sha, platform: 'linux/amd64', files, images, artifact_verification: { path: 'artifact-verification.json', sha256: files['artifact-verification.json'] }, independent_review: { path: 'independent-review.json', sha256: files['independent-review.json'] } }
  await writeFile(join(output, 'operator-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return { source_sha: m.source_sha, manifest_sha256: hash(await readFile(join(output, 'operator-manifest.json'))), target_config: 'BLOCKED', installation_authorized: false }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 6, 'Use ARTIFACT_DIR REVIEW_JSON DEPENDENCIES_JSON NEW_OUTPUT_DIR')
  console.log(JSON.stringify(await assembleOperatorBundle(...process.argv.slice(2).map(p => resolve(p)))))
}
