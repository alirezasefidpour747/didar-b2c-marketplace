// Build a fresh portable runtime; never mutate Next's traced output in place.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const root = resolve(import.meta.dirname, '../..'), destination = resolve(process.argv[2] || '')
if (!process.argv[2] || existsSync(destination) || destination === root || root.startsWith(destination + '/')) throw Error('Fresh package destination required')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const hasGit = existsSync(join(root, '.git'))
if (hasGit && git('status', '--porcelain', '--untracked-files=no')) throw Error('Commit tracked changes before packaging')
const sourceSha = hasGit ? git('rev-parse', 'HEAD') : process.env.DIDAR_PACKAGE_SOURCE_SHA
if (!/^[a-f0-9]{40}$/.test(sourceSha || '')) throw Error('Exact DIDAR_PACKAGE_SOURCE_SHA required when Git is excluded from build context')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const excluded = source => !relative(root, source).split('/').some(p => p === '.git' || p.startsWith('.env') || /\.(pem|key|p12|pfx|dump|bundle)$/.test(p))
mkdirSync(destination, { recursive: true })
cpSync(join(root, 'apps/storefront/.next/standalone'), destination, { recursive: true, dereference: true, filter: excluded })
for (const [source, target] of [
  ['apps/storefront/.next/static', 'apps/storefront/.next/static'],
  ['apps/storefront/public', 'apps/storefront/public'],
  ['apps/storefront/auth-ingress.mjs', 'apps/storefront/auth-ingress.mjs'],
  ['scripts/deployment/storefront.mjs', 'runtime/storefront.mjs'],
  ['scripts/deployment/health.mjs', 'runtime/health.mjs'],
  ['scripts/deployment/verify-package.mjs', 'runtime/verify-package.mjs'],
]) {
  mkdirSync(resolve(destination, target, '..'), { recursive: true })
  cpSync(join(root, source), join(destination, target), { recursive: true, dereference: true, filter: excluded })
}
// Tracing omits the separately launched ingress dependency. Install the physical
// package explicitly rather than preserving a link into a build workspace.
const auth = join(destination, 'node_modules/@didar/auth-network')
if (existsSync(auth)) throw Error('Unexpected traced auth package; inspect before replacing')
mkdirSync(auth, { recursive: true })
for (const name of ['index.cjs', 'index.d.ts', 'package.json']) cpSync(join(root, 'packages/auth-network', name), join(auth, name))
const files = []
function visit(path) {
  const stat = lstatSync(path), name = relative(destination, path)
  if (stat.isSymbolicLink() || !realpathSync(path).startsWith(destination + '/')) throw Error('Nonportable package link: ' + name)
  if (stat.isDirectory()) for (const entry of readdirSync(path).sort()) visit(join(path, entry))
  else if (stat.isFile()) files.push({ path: name, sha256: sha256(readFileSync(path)) })
}
for (const entry of readdirSync(destination).sort()) visit(join(destination, entry))
const manifest = { format: 1, source_sha: sourceSha, source_provenance: hasGit ? 'CLEAN_TRACKED_GIT_CHECKOUT' : 'BUILD_CALLER_SOURCE_SHA', platform: process.platform, arch: process.arch, node: process.versions.node, auth_module_sha256: sha256(readFileSync(join(auth, 'index.cjs'))), entrypoint: 'runtime/storefront.mjs', files, content_sha256: sha256(JSON.stringify(files)) }
writeFileSync(join(destination, 'PACKAGING.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ destination, source_sha: manifest.source_sha, files: files.length, content_sha256: manifest.content_sha256 }))
