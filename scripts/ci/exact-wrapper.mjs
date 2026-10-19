// Owned nested Debian daemon. Never changes the executor/owner Docker daemon.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile, cp, mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { observer } from '../topology/process.mjs'
const output = resolve('.local/wrapper-exact-evidence'); await mkdir(output, { recursive: true })
const stages = [], run = observer(output, stages), name = 'didar-exact-' + randomBytes(6).toString('hex')
const root = await mkdtemp(join(tmpdir(), name)), source = (await run('source', 'git', ['rev-parse', 'HEAD'])).stdout.toString().trim()
const docker = async (stage, args, options) => (await run(stage, 'docker', args, options)).stdout.toString().trim()
let id, volume, network, success = false
try {
  await run('prepare-authenticated-daemon-context', 'bash', ['scripts/ci/prepare-compat-context.sh', 'daemon', join(root, 'context')], { timeout: 1200000 })
  await docker('build-isolated-daemon', ['build', '--platform', 'linux/amd64', '-t', name, join(root, 'context')], { timeout: 1200000 })
  const image = JSON.parse(await docker('daemon-image-identity', ['image', 'inspect', name]))[0]
  volume = await docker('owned-daemon-data', ['volume', 'create', '--label', 'didar.exact.daemon=' + name, name])
  network = await docker('owned-daemon-network', ['network', 'create', '--label', 'didar.exact.daemon=' + name, name])
  id = await docker('create-owned-isolated-daemon', ['create', '--privileged', '--network', network, '--name', name, '--label', 'didar.exact.daemon=' + name, '--mount', 'type=volume,source=' + volume + ',target=/var/lib/docker', image.Id])
  const toolkit = join(root, 'toolkit'); await mkdir(join(toolkit, 'tests'), { recursive: true }); await mkdir(join(toolkit, 'scripts/deployment'), { recursive: true })
  await cp('scripts/deployment/nginx', join(toolkit, 'scripts/deployment/nginx'), { recursive: true, filter: path => !path.includes('__pycache__') })
  await cp('tests/nginx-stack-docker.mjs', join(toolkit, 'tests/nginx-stack-docker.mjs'))
  await docker('copy-verification-tools-only-before-daemon-start', ['cp', toolkit, id + ':/qa'])
  await docker('start-isolated-daemon', ['start', id])
  let ready = false
  for (let n = 0; n < 90; n++) {
    const probe = await run('nested-daemon-readiness-' + n, 'docker', ['exec', id, 'docker', 'info', '--format', '{{.ServerVersion}}'], { expected: [0, 1] })
    if (probe.code === 0) { ready = true; break }; await new Promise(done => setTimeout(done, 1000))
  }
  assert.ok(ready, 'Isolated Debian Docker26 daemon failed readiness')
  const version = await docker('exact-daemon-version', ['exec', id, 'docker', 'version', '--format', '{{json .Server}}'])
  const compose = await docker('exact-compose-version', ['exec', id, 'docker', 'compose', 'version', '--short'])
  assert.match(JSON.parse(version).Version, /^26\.1\.5(?:\+dfsg1)?$/); assert.match(compose, /^v?2\.26\.1(?:-4)?$/)
  const result = await run('real-wrapper-lifecycle-and-safe-failures', 'docker', ['exec', '-e', 'DIDAR_WRAPPER_SOURCE_SHA=' + source, '-w', '/qa', id, 'node', 'tests/nginx-stack-docker.mjs', '/qa/evidence'], { timeout: 1800000, expected: [0, 1] })
  await docker('retrieve-fixture-evidence', ['cp', id + ':/qa/evidence', join(output, 'fixture')])
  const diagnostic = Buffer.concat([result.stdout, result.stderr]).toString().replace(/literal(?:\$|%24)wrapper(?:#|%23)[a-f0-9]+/g, '[QA_SECRET_REDACTED]')
  await writeFile(join(output, 'fixture-runner.log'), diagnostic)
  console.log('DIDAR_WRAPPER_FIXTURE_ACTUAL_EXIT ' + JSON.stringify({code:result.code,signal:result.signal,spawn_error:result.spawn_error}))
  if (result.code !== 0) console.error(diagnostic.slice(-10000))
  if (result.code !== 0) for (const file of await readdir(join(output, 'fixture'))) if (/^failure-diagnostic-[0-9]+\.json$/.test(file)) console.error('DIDAR_WRAPPER_SANITIZED_FAILURE ' + await readFile(join(output, 'fixture', file), 'utf8'))
  assert.equal(result.code, 0)
  const fixture = JSON.parse(await readFile(join(output, 'fixture/result.json'))); assert.equal(fixture.status, 'PASS')
  await writeFile(join(output, 'provenance.json'), JSON.stringify({ source_sha: source, daemon_image_id: image.Id, server: JSON.parse(version), compose, candidate_package_provenance: JSON.parse(await readFile(join(root, 'context/packages.json'))), target_binary_identity_claimed: false, scope: 'Exact upstream version pair with independently pinned Debian package revisions; target package revisions unobserved. Wrapper protocol fixture, not R5 application or target acceptance.', application_source_overlays: false }, null, 2) + '\n')
  console.log('DIDAR_WRAPPER_OBSERVED_RESULT ' + JSON.stringify(fixture))
  success = true
} finally {
  if (id) {
    const state = JSON.parse(await docker('guard-owned-daemon-cleanup', ['inspect', id]))[0]; assert.equal(state.Config.Labels['didar.exact.daemon'], name)
    await docker('stop-owned-daemon', ['stop', '--time', '30', id]); const stopped = JSON.parse(await docker('owned-daemon-process-exit', ['inspect', id]))[0]
    await writeFile(join(output, 'daemon-exit.json'), JSON.stringify({ exit: stopped.State.ExitCode, oom: stopped.State.OOMKilled }) + '\n')
    const logs = await docker('daemon-diagnostics', ['logs', '--tail', '80', id]); await writeFile(join(output, 'daemon.log'), logs)
    await docker('remove-owned-daemon-only', ['rm', id])
  }
  if (volume) { const state = JSON.parse(await docker('guard-owned-data-cleanup', ['volume', 'inspect', volume]))[0]; assert.equal(state.Labels['didar.exact.daemon'], name); await docker('remove-owned-disposable-daemon-data', ['volume', 'rm', volume]) }
  if (network) { const state = JSON.parse(await docker('guard-owned-network-cleanup', ['network', 'inspect', network]))[0]; assert.equal(state.Labels['didar.exact.daemon'], name); await docker('remove-owned-network', ['network', 'rm', network]) }
  await rm(root, { recursive: true, force: true })
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: success ? 'PASS' : 'FAIL', source_sha: source, actual_child_exits: stages, managed_daemon_modified: false, owner_server_accessed: false, target_config: 'BLOCKED' }, null, 2) + '\n')
}
