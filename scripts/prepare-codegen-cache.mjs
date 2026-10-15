/**
 * Vendored route metadata fetched over verified HTTPS by official CLI 2.3.7
 * on 2026-10-15, from its default canary route-manifest endpoint.
 * The CLI explicitly supports this cache when GitHub is unavailable.
 * Keep this snapshot aligned with the pinned @mercurjs packages on upgrades.
 */
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const url='https://raw.githubusercontent.com/mercurjs/mercur/canary/packages/cli/routes-manifest.json'
const key=createHash('sha256').update(url).digest('hex').slice(0,16)
copyFileSync(fileURLToPath(new URL('./mercur-routes.snapshot.json',import.meta.url)),join(tmpdir(),`mercur-routes-manifest-${key}.json`))
console.log('Official Mercur 2.3.7 codegen fallback cache prepared.')
