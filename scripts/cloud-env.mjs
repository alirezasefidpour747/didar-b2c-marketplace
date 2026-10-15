import { existsSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const api='packages/api/.env'
if(!existsSync(api)) writeFileSync(api,`DIDAR_ENVIRONMENT=local\nDATABASE_URL=postgres://postgres@localhost:5432/didar\nREDIS_URL=redis://localhost:6379\nJWT_SECRET=${randomBytes(32).toString('hex')}\nCOOKIE_SECRET=${randomBytes(32).toString('hex')}\nSTORE_CORS=http://localhost:3000\nADMIN_CORS=http://localhost:9000,http://localhost:7000\nVENDOR_CORS=http://localhost:9000,http://localhost:7001\nAUTH_CORS=http://localhost:9000,http://localhost:7000,http://localhost:7001\nDIDAR_PAYMENT_MODE=sandbox\nDIDAR_SEED_DEMO=true\nMERCUR_DISABLE_TELEMETRY=true\n`,{mode:0o600})
// This helper is explicitly local. Migrate older local files by appending one missing flag;
// preserve every existing byte and never override an explicitly selected environment.
const apiContents = readFileSync(api, 'utf8')
if (!/^\s*(?:export\s+)?DIDAR_ENVIRONMENT\s*=/m.test(apiContents)) {
  appendFileSync(api, `${apiContents.endsWith('\n') ? '' : '\n'}DIDAR_ENVIRONMENT=local\n`)
}
if(!existsSync('apps/storefront/.env.local')) writeFileSync('apps/storefront/.env.local','MEDUSA_BACKEND_URL=http://localhost:9000\n',{mode:0o600})
console.log('Local development configuration present; existing files preserved.')
