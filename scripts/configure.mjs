import { existsSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const hex=()=>randomBytes(32).toString('hex')
if(!existsSync('.env')) writeFileSync('.env',`DIDAR_ENVIRONMENT=staging\nDIDAR_SEED_DEMO=false\nDIDAR_DB_PASSWORD=${hex()}\nJWT_SECRET=${hex()}\nCOOKIE_SECRET=${hex()}\nMERCUR_BACKEND_URL=http://localhost:9000\nSTOREFRONT_URL=http://localhost:3000\n`,{mode:0o600})
console.log('Docker configuration present; existing values preserved. Default deployment is staging; public demo accounts are disabled.')
