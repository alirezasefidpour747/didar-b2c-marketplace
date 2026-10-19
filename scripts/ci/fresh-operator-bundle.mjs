// Installation amendment only. Never modifies/rebuilds the accepted application release.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readBundle, sha256 } from '../deployment/nginx/stack.mjs'

export const applicationSource = '0c4b047baa9dbe37cd1876159c15d22b40cf7cac'
export const applicationImages = Object.freeze({
  api: 'sha256:1ffb2c40294dd899bfe6c4c76224cf7d0e3d5fe7e75e732e12f5d0a15c8911cf',
  storefront: 'sha256:b928edafdf670fa6ace1fcff550571d73cc5828b3bfdb2d0ed4a9ed914c86d10',
})
export const amendmentFiles = Object.freeze({
  'stack.mjs': 'scripts/deployment/nginx/stack.mjs',
  'fresh.mjs': 'scripts/deployment/nginx/fresh.mjs',
  'fresh-restore.mjs': 'scripts/deployment/nginx/fresh-restore.mjs',
  'provision-node.sh': 'scripts/deployment/nginx/provision-node.sh',
  'fresh-operator-bundle.mjs': 'scripts/ci/fresh-operator-bundle.mjs',
  'FRESH_INSTALL_FA.md': 'docs/deployment/PARALLEL_FRESH_INSTALL_FA.md',
  'fresh-operation.template.json': 'scripts/deployment/nginx/fresh-operation.template.json',
  'fresh-approval.template.json': 'scripts/deployment/nginx/fresh-approval.template.json',
  'fresh-topology.env.template': 'scripts/deployment/nginx/fresh-topology.env.template',
})

export async function assembleFreshAmendment(previousDirectory, previousHash, installationSource, output, sourceRoot = resolve(import.meta.dirname, '../..')) {
  assert.match(installationSource, /^[a-f0-9]{40}$/, 'Exact installation source SHA required')
  const oldManifest = join(previousDirectory, 'operator-manifest.json')
  const original = await readBundle(oldManifest, previousHash)
  assert.equal(original.manifest.kind, 'didar-nginx-verified-topology', 'Protocol fixture is not accepted installation provenance')
  assert.equal(original.manifest.source_sha, applicationSource, 'Accepted application source must be preserved')
  for (const role of ['api', 'storefront']) assert.equal(original.manifest.images[role].image_id, applicationImages[role], 'Accepted application image must be preserved')
  assert.ok(!original.manifest.files['fresh.mjs'] && !original.manifest.files['accepted-operator-manifest.json'], 'Do not stack amendments or adopt another fresh kit')
  // Read everything before creating output, then exclusively create a separate directory.
  const replacements = Object.fromEntries(await Promise.all(Object.entries(amendmentFiles).map(async ([name, path]) => [name, await readFile(join(sourceRoot, path))])))
  const originalBytes = await readFile(oldManifest)
  assert.equal(sha256(originalBytes), previousHash)
  const copied = Object.fromEntries(await Promise.all(Object.keys(original.manifest.files).map(async name => [name, await readFile(join(previousDirectory, name))])))
  await mkdir(output, { mode: 0o700, recursive: false })
  const manifest = structuredClone(original.manifest)
  for (const [name, bytes] of Object.entries({ ...copied, ...replacements, 'accepted-operator-manifest.json': originalBytes })) {
    await mkdir(dirname(join(output, name)), { recursive: true, mode: 0o700 })
    await writeFile(join(output, name), bytes, { flag: 'wx', mode: 0o600 })
    manifest.files[name] = sha256(bytes)
  }
  const amendment = {
    format: 1, kind: 'DIDAR_PARALLEL_FRESH_INSTALLATION_AMENDMENT',
    status: 'CANDIDATE_REQUIRES_CHIEF_ARCHITECT_ACCEPTANCE',
    application_source_sha: applicationSource, installation_source_sha: installationSource,
    original_operator_manifest_sha256: previousHash,
    application_images: applicationImages,
    changed_files: Object.fromEntries(Object.keys(amendmentFiles).map(name => [name, manifest.files[name]])),
    target_config: 'BLOCKED', public_https: 'NOT_VERIFIED',
    original_application_release_modified: false,
    candidate_approval_receipt_generated: false,
  }
  const amendmentBytes = Buffer.from(JSON.stringify(amendment, null, 2) + '\n')
  await writeFile(join(output, 'INSTALLATION_AMENDMENT.json'), amendmentBytes, { flag: 'wx', mode: 0o600 })
  manifest.files['INSTALLATION_AMENDMENT.json'] = sha256(amendmentBytes)
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(output, 'operator-manifest.json'), bytes, { flag: 'wx', mode: 0o600 })
  // App acceptance receipts remain unchanged. They do not approve new lifecycle code.
  await readBundle(join(output, 'operator-manifest.json'), sha256(bytes))
  return { status: amendment.status, application_source_sha: applicationSource,
    installation_source_sha: installationSource, operator_manifest_sha256: sha256(bytes),
    target_config: 'BLOCKED', public_https: 'NOT_VERIFIED', approval_generated: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 6, 'Use ORIGINAL_OPERATOR_DIR EXPECTED_ORIGINAL_MANIFEST_SHA256 INSTALLATION_SOURCE_SHA NEW_OUTPUT_DIR')
  console.log(JSON.stringify(await assembleFreshAmendment(resolve(process.argv[2]), process.argv[3], process.argv[4], resolve(process.argv[5]))))
}
