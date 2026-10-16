import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { capture } from './runtime.mjs'

function digest(root, paths) {
  const hash = createHash('sha256')
  function visit(relative) {
    const path = join(root, relative), name = relative.split('/').at(-1)
    if (name === 'node_modules' || ['apps/storefront/.next/cache', 'apps/storefront/.next/standalone', 'apps/storefront/.next/trace'].includes(relative) || name.startsWith('.env')) return
    const stat = statSync(path)
    if (stat.isDirectory()) for (const entry of readdirSync(path).sort()) visit(`${relative}/${entry}`)
    else if (stat.isFile()) hash.update(relative).update('\0').update(readFileSync(path)).update('\0')
  }
  for (const path of [...paths].sort()) visit(path)
  return hash.digest('hex')
}
export function receipt(root = '.', files) {
  const inputs = files || capture('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).split('\0').filter(path => /^(apps\/|packages\/|bun.lock$|package.json$|scripts\/(build-panels.mjs|prepare-codegen-cache.mjs|mercur-routes.snapshot.json)$)/.test(path) && existsSync(join(root, path)))
  for (const marker of ['packages/api/.medusa/server/medusa-config.js', 'apps/storefront/.next/BUILD_ID', 'apps/admin/dist/index.html', 'apps/vendor/dist/index.html'])
    if (!existsSync(join(root, marker))) throw new Error('Production build missing; run local:test without --reuse-build')
  return { platform: process.platform, arch: process.arch, node: process.versions.node, source: digest(root, inputs), outputs: digest(root, ['packages/api/.medusa/server', 'apps/storefront/.next', 'apps/admin/dist', 'apps/vendor/dist']) }
}
export function recordBuild(root = '.', files) {
  const value = receipt(root, files)
  mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 })
  writeFileSync(join(root, '.local/build-receipt.json'), JSON.stringify(value), { mode: 0o600 })
}
export function verifyBuild(root = '.', files) {
  const path = join(root, '.local/build-receipt.json')
  if (!existsSync(path) || JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) !== JSON.stringify(receipt(root, files)))
    throw new Error('Build receipt missing or source/artifacts/platform changed; run local:test without --reuse-build')
}
