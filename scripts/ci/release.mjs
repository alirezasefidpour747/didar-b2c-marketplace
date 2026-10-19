import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { prepareInstallKit, verifyInstallKit } from './install-kit.mjs';

export const requireSHA = value => {
  assert.match(value || '', /^[a-f0-9]{40}$/, 'Exact source SHA required');
  return value;
};
export const requireDigest = value => {
  assert.match(value || '', /^sha256:[a-f0-9]{64}$/, 'Immutable SHA256 digest required');
  return value;
};
export function validateManifest(m, expectedSource) {
  assert.equal(m.format, 1);
  assert.equal(m.source_sha, requireSHA(expectedSource));
  assert.deepEqual(Object.keys(m.images).sort(), ['api', 'storefront']);
  for (const [role, image] of Object.entries(m.images)) {
    requireDigest(image.id);
    assert.equal(image.platform, 'linux/amd64', 'No unverified multi-architecture claim');
    assert.equal(image.revision, m.source_sha);
    assert.match(image.local_tag, new RegExp(`^didar-release-${role}:sha-${m.source_sha}$`));
  }
  assert.match(m.archive_sha256, /^[a-f0-9]{64}$/);
  assert.equal(m.archive, 'images.tar.gz');
  assert.equal(m.verification.build.status, 'PASS');
  return m;
}
export async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export function command(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', timeout: 45 * 60 * 1000, ...options });
  if (r.error || r.status !== 0 || r.signal) throw Error(`${cmd} ${args[0] || ''}: observed exit=${r.status}, signal=${r.signal}, spawn=${r.error?.code || 'none'}`);
  return options.capture ? r.stdout.trim() : '';
}
export const imageInfo = (ref, env = process.env) => JSON.parse(command('docker', ['image', 'inspect', '--format', '{{json .}}', ref], { capture: true, env }));
export async function loadBundle(dir, expectedSource) {
  const m = validateManifest(JSON.parse(await readFile(join(dir, 'release-manifest.json'))), expectedSource);
  assert.equal(await fileHash(join(dir, m.archive)), m.archive_sha256, 'Archive digest mismatch');
  if (m.install_kit) await verifyInstallKit(dir, m.source_sha, m.install_kit);
  command('docker', ['load', '--input', join(dir, m.archive)]);
  for (const image of Object.values(m.images)) {
    const actual = imageInfo(image.local_tag);
    assert.equal(actual.Id, image.id);
    assert.equal(actual.Config.Labels['org.opencontainers.image.revision'], m.source_sha);
    assert.equal(`${actual.Os}/${actual.Architecture}`, image.platform);
  }
  return m;
}
export async function checksums(dir) {
  const m = JSON.parse(await readFile(join(dir, 'release-manifest.json')));
  const kit = m.install_kit ? await verifyInstallKit(dir, m.source_sha, m.install_kit) : [];
  const files = ['images.tar.gz', 'release-manifest.json', 'INSTALL.md', ...kit];
  await writeFile(join(dir, 'SHA256SUMS'), (await Promise.all(files.map(async f => `${await fileHash(join(dir, f))}  ${f}`))).join('\n') + '\n');
}
async function build(dir) {
  const sha = requireSHA(process.env.DIDAR_RELEASE_SOURCE);
  assert.equal(command('git', ['rev-parse', 'HEAD'], { capture: true }), sha);
  assert.equal(command('git', ['status', '--porcelain', '--untracked-files=no'], { capture: true }), '');
  const validation = JSON.parse(await readFile('.local/ci-evidence/validation.json'));
  assert.equal(validation.status, 'PASS');
  assert.equal(validation.source_sha, sha);
  const tags = Object.fromEntries(['api', 'storefront'].map(role => [role, `didar-release-${role}:sha-${sha}`]));
  command('bash', ['scripts/build-prepared-images.sh', '--reuse-build'], { env: { ...process.env, DIDAR_API_IMAGE: tags.api, DIDAR_STOREFRONT_IMAGE: tags.storefront } });
  await mkdir(dir, { recursive: true });
  const images = {};
  for (const [role, tag] of Object.entries(tags)) {
    const info = imageInfo(tag);
    images[role] = { local_tag: tag, id: info.Id, platform: `${info.Os}/${info.Architecture}`, revision: info.Config.Labels['org.opencontainers.image.revision'] };
  }
  // Observe the save process AND the compression pipeline; neither summary text nor
  // successful gzip alone establishes that docker save completed successfully.
  const child = spawn('docker', ['save', tags.api, tags.storefront], { stdio: ['ignore', 'pipe', 'inherit'] });
  const closed = new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 && !signal ? accept() : reject(Error(`docker save exit=${code}, signal=${signal}`)));
  });
  await Promise.all([closed, pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(join(dir, 'images.tar.gz')))]);
  const manifest = {
    format: 1, source_sha: sha, install_kit: await prepareInstallKit(dir, sha), created_at: new Date().toISOString(),
    workflow_run: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    accepted_ci_run: process.env.DIDAR_RELEASE_CI_RUN,
    images, archive: 'images.tar.gz', archive_sha256: await fileHash(join(dir, 'images.tar.gz')),
    verification: { build: validation, independent_artifacts: { status: 'NOT_EXECUTED' }, inherited: [] },
    registry: { status: 'NOT_PUBLISHED', digest_vs_id: 'Docker image IDs are config identities; registry manifest digests are recorded separately after publication.' },
    limits: ['Linux/amd64 only', 'No staging installation or Internet verification', 'No production readiness claim'],
  };
  validateManifest(manifest, sha);
  await writeFile(join(dir, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await copyFile('docs/CI_RELEASE_INSTALL.md', join(dir, 'INSTALL.md'));
  await checksums(dir);
}
export function requirePublishableBundle(m) {
  assert.equal(m.verification.independent_artifacts.status, 'PASS');
  // The legacy socket verifier cannot authorize the new first-hop topology.
  // Fail closed until its no-overlay artifact gate is implemented and reviewed.
  assert.ok(!m.install_kit, 'NGINX_ARTIFACT_RELEASE_AUTOMATION_BLOCKED');
}
async function publish(dir) {
  const candidate = validateManifest(JSON.parse(await readFile(join(dir, 'release-manifest.json'))), process.env.DIDAR_RELEASE_SOURCE);
  requirePublishableBundle(candidate);
  const m = await loadBundle(dir, process.env.DIDAR_RELEASE_SOURCE);
  const root = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'didar-registry-'));
  const authenticated = join(root, 'authenticated'), anonymous = join(root, 'anonymous');
  await mkdir(authenticated, { mode: 0o700 }); await mkdir(anonymous, { mode: 0o700 });
  const env = { ...process.env, DOCKER_CONFIG: authenticated };
  const result = { status: 'FAIL', images: {}, fallback: 'Verified downloadable release artifact in the verify job; authentication to GitHub may be required.', error: null };
  try {
    assert.match(process.env.GITHUB_REPOSITORY || '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    assert.match(process.env.GITHUB_RUN_ID || '', /^\d+$/);
    assert.match(process.env.GITHUB_RUN_ATTEMPT || '', /^\d+$/);
    assert.ok(process.env.GHCR_TOKEN);
    command('docker', ['login', 'ghcr.io', '--username', process.env.GITHUB_ACTOR, '--password-stdin'], { env, input: process.env.GHCR_TOKEN + '\n', stdio: ['pipe', 'inherit', 'inherit'] });
    for (const [role, image] of Object.entries(m.images)) {
      const name = `ghcr.io/${process.env.GITHUB_REPOSITORY.toLowerCase()}/${role}`;
      const tag = `${name}:sha-${m.source_sha}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
      // Never overwrite an existing tag. Consumers always receive digest refs.
      const exists = spawnSync('docker', ['manifest', 'inspect', tag], { env, stdio: 'ignore', timeout: 60000 });
      if (exists.status === 0) throw Error(`Refusing existing release tag for ${role}`);
      command('docker', ['tag', image.id, tag], { env });
      command('docker', ['push', tag], { env });
      const pushed = imageInfo(tag, env);
      const ref = (pushed.RepoDigests || []).find(r => r.startsWith(name + '@sha256:'));
      assert.ok(ref, 'Registry digest missing'); requireDigest(ref.split('@')[1]);
      command('docker', ['pull', ref], { env });
      assert.equal(imageInfo(ref, env).Id, image.id);
      const access = spawnSync('docker', ['--config', anonymous, 'manifest', 'inspect', ref], { stdio: 'ignore', timeout: 60000 });
      result.images[role] = { reference: ref, tag, id: image.id, authenticated_digest_pull: 'PASS', anonymous_manifest_access: access.status === 0 ? 'PASS' : 'UNAVAILABLE_AUTHENTICATION_REQUIRED_OR_NETWORK_FAILURE' };
    }
    result.status = 'PASS';
    await writeFile(join(dir, 'registry-manifest.json'), JSON.stringify({ ...m, registry: result }, null, 2) + '\n');
  } catch (error) {
    result.error = error.message;
    process.exitCode = 1; // Red registry job is honest; verified fallback remains downloadable.
  } finally {
    await writeFile(join(dir, 'registry-result.json'), JSON.stringify(result, null, 2) + '\n');
    await rm(root, { recursive: true, force: true }); // Exact newly owned credential directory only.
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, dir] = process.argv.slice(2);
  assert.ok(dir, 'Artifact directory required');
  if (mode === 'build') await build(resolve(dir));
  else if (mode === 'publish') await publish(resolve(dir));
  else throw Error('Use build|publish <artifact-directory>');
}
