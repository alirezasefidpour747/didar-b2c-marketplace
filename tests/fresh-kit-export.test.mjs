import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { bundleFiles, sha256 } from '../scripts/deployment/nginx/stack.mjs'
import { assembleFreshAmendment, applicationSource, applicationImages } from '../scripts/ci/fresh-operator-bundle.mjs'
import { exportFreshInstallKit } from '../scripts/ci/export-fresh-install-kit.mjs'

const sourceRoot = resolve(import.meta.dirname, '..')
async function fixture(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'didar-kit-export-unit-')), original = join(directory, 'original'), candidate = join(directory, 'candidate'), output = join(directory, 'output')
  await mkdir(original); await mkdir(output)
  try {
    const manifest = { format: 1, kind: 'didar-nginx-verified-topology', source_sha: applicationSource, platform: 'linux/amd64', files: {}, images: Object.fromEntries(['api', 'storefront', 'postgres', 'redis'].map((role, n) => [role, { reference: applicationImages[role] || 'sha256:' + String(n).repeat(64), image_id: applicationImages[role] || 'sha256:' + String(n).repeat(64) }])), artifact_verification: { path: 'artifact-verification.json' }, independent_review: { path: 'independent-review.json' } }
    for (const file of bundleFiles) { const bytes = await readFile(join(sourceRoot, 'scripts/deployment/nginx', file)); await writeFile(join(original, file), bytes); manifest.files[file] = sha256(bytes) }
    // Local structural unit fixtures only; never delivery evidence/target approval.
    for (const [field, status] of [['artifact_verification', 'PASS'], ['independent_review', 'APPROVED']]) {
      const bytes = Buffer.from(JSON.stringify({ status, source_sha: applicationSource, topology: 'nginx-verified-relay-v1', workspace_mounts: false, source_overlays: false, exit_code: 0, images: applicationImages, reviewer: 'SYNTHETIC_LOCAL_UNIT_FIXTURE_NOT_APPROVAL' }))
      await writeFile(join(original, manifest[field].path), bytes); manifest[field].sha256 = sha256(bytes); manifest.files[manifest[field].path] = sha256(bytes)
    }
    await writeFile(join(original, 'operator-manifest.json'), JSON.stringify(manifest))
    const originalHash = sha256(await readFile(join(original, 'operator-manifest.json'))), installationSource = 'f'.repeat(40)
    const next = await assembleFreshAmendment(original, originalHash, installationSource, candidate)
    await fn({ directory, original, candidate, output, originalHash, candidateHash: next.operator_manifest_sha256, installationSource })
  } finally { await rm(directory, { recursive: true, force: true }) }
}
const options = f => ({ originalDirectory: f.original, originalHash: f.originalHash, candidateDirectory: f.candidate, candidateHash: f.candidateHash, sourceRoot, installationSource: f.installationSource, outputDirectory: f.output })

test('actual pre-QA archive preserves both manifests, excludes private context and contains a runnable complete source closure', async () => fixture(async f => {
  const canary = 'PRIVATE_NETWORK_KEY_MUST_NEVER_SHIP'; await writeFile(join(f.directory, 'network.key'), canary)
  const receipt = await exportFreshInstallKit(options(f))
  assert.equal(receipt.status, 'CANDIDATE_REQUIRES_CHIEF_ARCHITECT_ACCEPTANCE'); assert.equal(receipt.target_config, 'BLOCKED'); assert.equal(receipt.public_https, 'NOT_VERIFIED'); assert.equal(receipt.approval_generated, false)
  assert.equal(receipt.candidate_kind, 'didar-nginx-verified-topology'); assert.deepEqual(receipt.application_images, applicationImages)
  assert.ok(receipt.actual_process_exits.length === 3 && receipt.actual_process_exits.every(row => row.code === 0 && row.signal === null))
  const archive = join(f.output, receipt.archive), listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' }); assert.equal(listing.status, 0)
  assert.equal(listing.stdout.includes('network.key'), false); assert.equal(listing.stdout.includes('context.private'), false); assert.equal(listing.stdout.includes('fixture-artifact_verification'), false)
  const unpacked = join(f.directory, 'unpacked'); await mkdir(unpacked)
  assert.equal(spawnSync('tar', ['-xzf', archive, '-C', unpacked, '--no-same-owner']).status, 0)
  assert.equal(sha256(await readFile(join(unpacked, 'original-operator/operator-manifest.json'))), f.originalHash)
  assert.equal(sha256(await readFile(join(unpacked, 'candidate-operator/operator-manifest.json'))), f.candidateHash)
  const restored = join(f.directory, 'reproduced-candidate'), child = spawnSync(process.execPath, [join(unpacked, 'source/scripts/ci/fresh-operator-bundle.mjs'), join(unpacked, 'original-operator'), f.originalHash, f.installationSource, restored], { encoding: 'utf8' })
  assert.equal(child.status, 0); assert.equal(child.signal, null); assert.equal(JSON.parse(child.stdout).approval_generated, false)
  assert.equal(sha256(await readFile(join(restored, 'operator-manifest.json'))), f.candidateHash)
  const manifest = JSON.parse(await readFile(join(f.candidate, 'operator-manifest.json'))); manifest.kind = 'didar-nginx-wrapper-protocol-fixture'; await writeFile(join(f.candidate, 'operator-manifest.json'), JSON.stringify(manifest))
  assert.equal(JSON.parse(await readFile(join(unpacked, 'candidate-operator/operator-manifest.json'))).kind, 'didar-nginx-verified-topology', 'Export is an immutable pre-QA snapshot')
}))

test('unknown private files in an input kit fail closed before any archive is created', async () => fixture(async f => {
  await writeFile(join(f.candidate, 'admin.private.json'), '{"password":"MUST_NOT_SHIP"}')
  await assert.rejects(exportFreshInstallKit(options(f)), /Private or QA files/)
  await assert.rejects(access(join(f.output, 'install-kit-candidate.tar.gz')))
}))

test('mutated QA manifests cannot be published as target installation kits', async () => fixture(async f => {
  const manifest = JSON.parse(await readFile(join(f.candidate, 'operator-manifest.json'))); manifest.kind = 'didar-nginx-wrapper-protocol-fixture'; await writeFile(join(f.candidate, 'operator-manifest.json'), JSON.stringify(manifest)); f.candidateHash = sha256(await readFile(join(f.candidate, 'operator-manifest.json')))
  await assert.rejects(exportFreshInstallKit(options(f)), /INVALID_BUNDLE_PROVENANCE/)
  await assert.rejects(access(join(f.output, 'install-kit-candidate.tar.gz')))
}))
