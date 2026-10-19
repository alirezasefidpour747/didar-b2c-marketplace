// Safe pre-QA delivery export. Never traverses the private runner context.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, readdir, open } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readBundle, sha256, bundleFiles } from '../deployment/nginx/stack.mjs'
import { applicationSource, applicationImages, amendmentFiles } from './fresh-operator-bundle.mjs'

export async function exportFreshInstallKit({ originalDirectory, originalHash, candidateDirectory, candidateHash, sourceRoot, installationSource, outputDirectory, run }) {
  const original = await readBundle(join(originalDirectory, 'operator-manifest.json'), originalHash)
  const candidate = await readBundle(join(candidateDirectory, 'operator-manifest.json'), candidateHash)
  const receipts = []
  const execute = run || (async (stage, command, args, options = {}) => {
    const child = spawnSync(command, args, { cwd: options.cwd, stdio: 'pipe', timeout: 60000 })
    receipts.push({ stage, code: child.status, signal: child.signal, spawn_error: child.error?.code || null })
    assert.equal(child.status, 0, 'KIT_EXPORT_STAGE_FAILED:' + stage); assert.equal(child.signal, null); assert.equal(child.error, undefined)
    return child.stdout.toString().trim()
  })
  assert.match(installationSource, /^[a-f0-9]{40}$/)
  for (const bundle of [original, candidate]) {
    assert.equal(bundle.manifest.kind, 'didar-nginx-verified-topology', 'QA protocol fixture must never become an installation delivery')
    assert.equal(bundle.manifest.source_sha, applicationSource)
    for (const role of ['api', 'storefront']) assert.equal(bundle.manifest.images[role].image_id, applicationImages[role])
  }
  assert.deepEqual(candidate.manifest.images, original.manifest.images)
  const originalNames = [...bundleFiles, 'artifact-verification.json', 'independent-review.json'].sort()
  const candidateNames = [...new Set([...originalNames, ...Object.keys(amendmentFiles), 'accepted-operator-manifest.json', 'INSTALLATION_AMENDMENT.json'])].sort()
  const exports = {}
  for (const [role, directory, bundle, expected] of [['original-operator', originalDirectory, original, originalNames], ['candidate-operator', candidateDirectory, candidate, candidateNames]]) {
    assert.deepEqual(Object.keys(bundle.manifest.files).sort(), expected, 'Explicit installation file allowlist required')
    assert.deepEqual((await readdir(directory)).sort(), [...expected, 'operator-manifest.json'].sort(), 'Private or QA files must not enter the installation export')
    for (const name of [...expected, 'operator-manifest.json']) exports[role + '/' + name] = await readFile(join(directory, name))
  }
  assert.equal(sha256(exports['candidate-operator/accepted-operator-manifest.json']), originalHash)
  const amendment = JSON.parse(exports['candidate-operator/INSTALLATION_AMENDMENT.json'])
  assert.equal(amendment.status, 'CANDIDATE_REQUIRES_CHIEF_ARCHITECT_ACCEPTANCE')
  assert.equal(amendment.application_source_sha, applicationSource); assert.equal(amendment.installation_source_sha, installationSource)
  assert.equal(amendment.original_operator_manifest_sha256, originalHash)
  assert.equal(amendment.target_config, 'BLOCKED'); assert.equal(amendment.public_https, 'NOT_VERIFIED')
  assert.equal(amendment.original_application_release_modified, false); assert.equal(amendment.candidate_approval_receipt_generated, false)
  const pending = JSON.parse(exports['candidate-operator/fresh-approval.template.json'])
  assert.equal(pending.status, 'PENDING'); assert.equal(pending.domain_cutover_authorized, false)
  // Complete minimal relative source closure for the deterministic amendment
  // assembler; no node_modules, workspace mounts, runtime configuration or keys.
  const sourceFiles = [...new Set([...Object.values(amendmentFiles), ...bundleFiles.map(name => 'scripts/deployment/nginx/' + name), 'scripts/ci/export-fresh-install-kit.mjs'])].sort()
  for (const path of sourceFiles) exports['source/' + path] = await readFile(join(sourceRoot, path))
  for (const [name, path] of Object.entries(amendmentFiles)) assert.equal(sha256(exports['source/' + path]), candidate.manifest.files[name], 'Source closure must match actual candidate bytes')
  const metadata = { format: 1, kind: 'DIDAR_PRE_QA_INSTALLATION_KIT_DELIVERY', status: 'CANDIDATE_REQUIRES_CHIEF_ARCHITECT_ACCEPTANCE', application_source_sha: applicationSource, installation_source_sha: installationSource, application_images: applicationImages, dependency_images: Object.fromEntries(['postgres', 'redis'].map(role => [role, original.manifest.images[role]])), original_operator_manifest_sha256: originalHash, candidate_operator_manifest_sha256: candidateHash, original_kind: original.manifest.kind, candidate_kind: candidate.manifest.kind, inherited_application_review_only: true, target_config: 'BLOCKED', public_https: 'NOT_VERIFIED', approval_generated: false, application_release_modified: false, file_sha256: Object.fromEntries(Object.entries(exports).sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => [name, sha256(bytes)])) }
  exports['delivery-manifest.json'] = Buffer.from(JSON.stringify(metadata, null, 2) + '\n')
  const checksums = Object.entries(exports).sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => sha256(bytes) + '  ' + name).join('\n') + '\n'
  exports.SHA256SUMS = Buffer.from(checksums)
  const staging = join(dirname(candidateDirectory), 'sanitized-pre-qa-kit'), verified = join(dirname(candidateDirectory), 'verified-pre-qa-kit')
  await mkdir(staging, { mode: 0o700 }); await mkdir(verified, { mode: 0o700 })
  for (const [path, bytes] of Object.entries(exports)) { await mkdir(dirname(join(staging, path)), { recursive: true, mode: 0o700 }); await writeFile(join(staging, path), bytes, { flag: 'wx', mode: 0o600 }) }
  const archive = join(outputDirectory, 'install-kit-candidate.tar.gz')
  await (await open(archive, 'wx', 0o600)).close()
  await execute('archive-explicit-pre-qa-installation-kit', 'tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--mode=u+rwX,go-rwx', '-czf', archive, '-C', staging, '.'])
  await execute('extract-actual-pre-qa-kit-archive', 'tar', ['-xzf', archive, '-C', verified, '--no-same-owner'])
  await execute('every-exported-kit-checksum', 'sha256sum', ['--check', 'SHA256SUMS'], { cwd: verified })
  await readBundle(join(verified, 'original-operator/operator-manifest.json'), originalHash)
  await readBundle(join(verified, 'candidate-operator/operator-manifest.json'), candidateHash)
  const archiveHash = sha256(await readFile(archive))
  await writeFile(join(outputDirectory, 'install-kit-candidate.tar.gz.sha256'), archiveHash + '  install-kit-candidate.tar.gz\n', { flag: 'wx', mode: 0o600 })
  const receipt = { ...metadata, archive: 'install-kit-candidate.tar.gz', archive_sha256: archiveHash, actual_process_exits: receipts, process_receipts_recorded_by: run ? 'CALLER_OBSERVED_RUNNER' : 'LOCAL_OBSERVED_CHILD_CLOSE' }
  await writeFile(join(outputDirectory, 'install-kit-candidate.manifest.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return receipt
}
