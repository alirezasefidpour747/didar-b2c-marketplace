import { readFileSync, readlinkSync, realpathSync, lstatSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(root, 'PACKAGING.json'), 'utf8'))
const hash = b => createHash('sha256').update(b).digest('hex')
if (manifest.format !== 1 || hash(JSON.stringify(manifest.files)) !== manifest.content_sha256) throw Error('Invalid package manifest')
if (manifest.platform !== process.platform || manifest.arch !== process.arch) throw Error('Package/runtime platform mismatch; rebuild for this platform')
for (const file of manifest.files) {
  const path = resolve(root, file.path)
  if (!path.startsWith(root + '/') || !realpathSync(path).startsWith(root + '/')) throw Error('External package path: ' + file.path)
  if (file.link !== undefined) {
    if (!lstatSync(path).isSymbolicLink() || file.link.startsWith('/') || readlinkSync(path) !== file.link) throw Error('Package link mismatch: ' + file.path)
  } else if (lstatSync(path).isSymbolicLink() || hash(readFileSync(path)) !== file.sha256) throw Error('Package content mismatch: ' + file.path)
}
console.log(JSON.stringify({ stage: 'package-verified', source_sha: manifest.source_sha, content_sha256: manifest.content_sha256, files: manifest.files.length }))
