// Separate-runner acceptance of downloaded, source-bound immutable images.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { loadBundle, fileHash, checksums, requireSHA } from './release.mjs'
import { observer } from '../topology/process.mjs'
import { validateTopologyReceipt } from './topology-receipt.mjs'
export { requiredCategories, validateTopologyReceipt } from './topology-receipt.mjs'
// Kept importable for focused negative tests without starting any containers.
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const dir = resolve(process.argv[2]), source = requireSHA(process.env.DIDAR_RELEASE_SOURCE), repo = resolve('.')
  const out = resolve('.local/topology-artifact-evidence'); await mkdir(out, { recursive: true })
  const exits = [], run = observer(out, exits)
  let manifest, status = 'FAIL'
  try {
    assert.equal((await run('exact-source', 'git', ['rev-parse', 'HEAD'])).stdout.toString().trim(), source)
    assert.equal((await run('clean-tracked-source', 'git', ['status', '--porcelain', '--untracked-files=no'])).stdout.toString().trim(), '')
    const initial = JSON.parse(await readFile(join(dir, 'release-manifest.json')))
    for (const image of Object.values(initial.images)) {
      const absent = await run('no-preloaded-candidate-image', 'docker', ['image', 'inspect', image.id], { expected: [1] }); assert.equal(absent.code, 1)
    }
    manifest = await loadBundle(dir, source)
    const versions = {}
    for (const [role, image] of Object.entries(manifest.images)) {
      const script = role === 'api' ? "const fs=require('node:fs'),c=require('node:crypto'),cp=require('node:child_process');process.stdout.write(JSON.stringify({node:process.version,bun:cp.execFileSync('bun',['--version']).toString().trim(),lock_sha256:c.createHash('sha256').update(fs.readFileSync('/app/bun.lock')).digest('hex')}))" : "const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(JSON.stringify({node:process.version,packaging_sha256:c.createHash('sha256').update(fs.readFileSync('/app/PACKAGING.json')).digest('hex')}))"
      const result = await run('image-owned-versions-' + role, 'docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image.id, '-e', script]); versions[role] = JSON.parse(result.stdout)
      assert.equal(versions[role].node, 'v24.19.0')
    }
    assert.equal(versions.api.bun, '1.4.3'); assert.equal(versions.api.lock_sha256, await fileHash('bun.lock'))
    const nginx = process.env.DIDAR_QA_NGINX_IMAGE; assert.match(nginx || '', /^sha256:[a-f0-9]{64}$/)
    const input = { packaged_images: true, source_sha: source, repository: repo, output_dir: join(out, 'topology'), api_image: manifest.images.api.id, frontend_base_image: manifest.images.storefront.id, image_ids: Object.fromEntries(Object.entries(manifest.images).map(([k,v]) => [k,v.id])), nginx_image: nginx,
      postgres_image: 'postgres:17-bookworm@sha256:66aafa11cf15800a3c94763f7e11d1e7b2e37e5e84bc4ce027cb6e1e4bfaf4df', redis_image: 'redis:7-bookworm@sha256:cd745595f143052dd6a743bc5651d3ce4b03979fe5c99c7fcfab73461f6f217b' }
    // Runtime inputs contain image identities, no credentials or private source paths.
    await writeFile(join(out, 'input.json'), JSON.stringify(input, null, 2) + '\n')
    const result = await run('actual-new-topology-artifacts', process.execPath, ['scripts/topology/stack.mjs', join(out, 'input.json')], { timeout: 3600000 })
    const topology = JSON.parse(await readFile(join(out, 'topology/result.json'))), provenance = JSON.parse(await readFile(join(out, 'topology/provenance.json')))
    assert.equal(topology.status, 'PASS_SCOPED_APPLICATION_TOPOLOGY'); assert.equal(topology.cleanup, 'PASS')
    assert.equal(provenance.packaged_images, true); assert.deepEqual(provenance.api_overlay, [])
    const receipt = { status: 'PASS', source_sha: source, image_ids: input.image_ids, archive_sha256: manifest.archive_sha256, kit_sha256: manifest.install_kit.sha256, no_application_overlays: true, clean_app_image_environment: true, categories: topology.verification_outcomes, process: { code: result.code, signal: result.signal, spawn_error: result.spawn_error }, evidence_sha256: await fileHash(join(out, 'topology/result.json')), packaging_sha256: versions.storefront.packaging_sha256, versions, runner: { run_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` } }
    validateTopologyReceipt(manifest, receipt)
    manifest.verification.independent_artifacts = receipt
    await writeFile(join(dir, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); await checksums(dir)
    status = 'PASS'
  } finally { await writeFile(join(out, 'result.json'), JSON.stringify({ status, source_sha: source, actual_child_exits: exits, candidate_not_accepted_main_release: true, target_config: 'BLOCKED', public_https_acceptance: 'NOT_EXECUTED' }, null, 2) + '\n') }
}
