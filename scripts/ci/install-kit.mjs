// Deterministic, source-bound REVIEW kit; never render target facts or copy secrets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
export const kitFiles = [
  'docs/AUTH_DEPLOYMENT_PACKAGING.md',
  'docs/AUTH_NETWORK_TRUST_AND_THROTTLING.md',
  'docs/deployment/NGINX_VERIFIED_TOPOLOGY.md',
  'docs/deployment/PR31_RELEASE_PREPARATION.md',
  'scripts/deployment/nginx/sign.mjs',
  'scripts/deployment/nginx/auth.mjs',
  'scripts/deployment/nginx/README.md',
  'scripts/deployment/nginx/render.mjs',
  'scripts/deployment/nginx/nginx.conf.template',
  'scripts/deployment/nginx/proxy-headers.conf',
  'scripts/deployment/nginx/compose.topology.json',
  'scripts/deployment/nginx/topology.env.template',
].sort();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function prepareInstallKit(dir, sha, source = resolve(import.meta.dirname, '../..')) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  const root = join(dir, 'install-kit');
  const files = {};
  for (const file of kitFiles) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(source, file), join(root, file));
    files[file] = hash(await readFile(join(root, file)));
  }
  const manifest = { format: 1, source_sha: sha, target_config: 'BLOCKED',
    status: 'REVIEW_CANDIDATE_NOT_TARGET_INSTALL_AUTHORIZATION', files };
  await writeFile(join(root, 'kit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { manifest: 'install-kit/kit-manifest.json', sha256: hash(await readFile(join(root, 'kit-manifest.json'))), target_config: 'BLOCKED' };
}
export async function verifyInstallKit(dir, sha, receipt) {
  assert.equal(receipt.manifest, 'install-kit/kit-manifest.json');
  const bytes = await readFile(join(dir, receipt.manifest));
  assert.equal(hash(bytes), receipt.sha256, 'Installation kit manifest mismatch');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.format, 1);
  assert.equal(manifest.source_sha, sha);
  assert.equal(manifest.target_config, 'BLOCKED');
  assert.equal(manifest.status, 'REVIEW_CANDIDATE_NOT_TARGET_INSTALL_AUTHORIZATION');
  assert.deepEqual(Object.keys(manifest.files).sort(), kitFiles);
  for (const file of kitFiles) assert.equal(hash(await readFile(join(dir, 'install-kit', file))), manifest.files[file], 'Installation kit byte mismatch: ' + file);
  return ['install-kit/kit-manifest.json', ...kitFiles.map(f => 'install-kit/' + f)];
}
